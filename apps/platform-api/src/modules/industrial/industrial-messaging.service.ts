import { Inject, Injectable, Logger } from "@nestjs/common";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  industrialMessagingAttachments,
  industrialMessagingMessages,
  industrialMessagingThreadMembers,
  industrialMessagingThreads,
  industrialPersonnel,
  industrialSites,
  persons,
  type Database,
  type DatabaseTransaction,
  userTenantMemberships,
  withBypassRlsTransaction,
  withTenantTransaction,
  users,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { isOnlineFromActivity } from "../auth-context/auth-context.service.js";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  buildMessagePreview,
  canStreamInline,
  isAllowedMessagingMime,
  isValidHttpUrl,
  MAX_MESSAGING_ATTACHMENT_BYTES,
  messagingAttachmentTypeForMime,
} from "./industrial-messaging.mime.js";

type LinkInput = { url: string; title?: string; description?: string };

type MessagingReplyTo = {
  messageId: string;
  senderUserId: string;
  senderName: string;
  bodyPreview: string;
};

const PLATFORM_ADMIN_DISPLAY_NAME = "Forge Admin";
const REPLY_PREVIEW_MAX = 160;

function messagingObjectKeyPrefix(tenantId: string, threadId: string): string {
  return `tenants/${tenantId}/messaging/${threadId}/`;
}

function truncateReplyPreview(body: string, hasAttachments = false): string {
  const trimmed = String(body ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (trimmed) {
    return trimmed.length > REPLY_PREVIEW_MAX
      ? `${trimmed.slice(0, REPLY_PREVIEW_MAX - 1)}…`
      : trimmed;
  }
  return hasAttachments ? "Attachment" : "Message";
}

function readReplyToFromMetadata(metadata: unknown): MessagingReplyTo | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const reply = (metadata as { replyTo?: unknown }).replyTo;
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) return null;
  const row = reply as Record<string, unknown>;
  const messageId = String(row.messageId ?? "").trim();
  if (!messageId) return null;
  return {
    messageId,
    senderUserId: String(row.senderUserId ?? "").trim(),
    senderName: String(row.senderName ?? "").trim() || "User",
    bodyPreview: String(row.bodyPreview ?? "").trim() || "Message",
  };
}

function normalizeThreadType(value: unknown): "DIRECT" | "GROUP" | "CHANNEL" {
  const raw = String(value ?? "DIRECT").toUpperCase();
  if (raw === "GROUP" || raw === "CHANNEL") return raw;
  return "DIRECT";
}

function formatUserDisplayName(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
  fallback?: string;
}): string {
  const display = (input.displayName ?? "").trim();
  if (display) return display;
  const full = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  const username = (input.username ?? "").trim();
  if (username) return username;
  const email = (input.email ?? "").trim();
  if (email) return email;
  return (input.fallback ?? "User").trim();
}

@Injectable()
export class IndustrialMessagingService {
  private readonly logger = new Logger(IndustrialMessagingService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(DocumentStorageService) private readonly storage: DocumentStorageService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  async listThreads(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const memberships = await tx
          .select({ threadId: industrialMessagingThreadMembers.threadId })
          .from(industrialMessagingThreadMembers)
          .where(
            and(
              eq(industrialMessagingThreadMembers.tenantId, tenantId),
              eq(industrialMessagingThreadMembers.userId, userId),
            ),
          );

        const threadIds = memberships.map((m) => m.threadId);
        if (threadIds.length === 0) {
          return { items: [], available: true };
        }

        const threads = await tx
          .select()
          .from(industrialMessagingThreads)
          .where(
            and(
              eq(industrialMessagingThreads.tenantId, tenantId),
              inArray(industrialMessagingThreads.id, threadIds),
              isNull(industrialMessagingThreads.archivedAt),
            ),
          )
          .orderBy(desc(industrialMessagingThreads.lastMessageAt));

        const activeIds = threads.map((t) => t.id);
        const [unreadByThread, membersByThread] = await Promise.all([
          this.unreadCountsForThreads(tx, tenantId, userId, activeIds),
          this.loadThreadMemberSummariesForThreads(tx, tenantId, activeIds),
        ]);

        const items = threads.map((thread) => {
          const members = membersByThread.get(thread.id) ?? [];
          return {
            id: thread.id,
            threadType: thread.threadType,
            title: thread.title ?? this.resolveThreadTitle(thread, members, userId),
            lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
            lastMessagePreview: thread.lastMessagePreview ?? "",
            unreadCount: unreadByThread.get(thread.id) ?? 0,
            memberCount: members.length,
            members,
          };
        });

        return { items, available: true };
      },
      userId,
    );
  }

  /**
   * Lightweight unread badge payload for the shell nav poll.
   * Avoids loading every thread's member roster every few seconds.
   */
  async unreadSummary(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const memberships = await tx
          .select({ threadId: industrialMessagingThreadMembers.threadId })
          .from(industrialMessagingThreadMembers)
          .where(
            and(
              eq(industrialMessagingThreadMembers.tenantId, tenantId),
              eq(industrialMessagingThreadMembers.userId, userId),
            ),
          );
        const threadIds = memberships.map((m) => m.threadId);
        if (threadIds.length === 0) {
          return { totalUnread: 0, focus: null, available: true };
        }

        const threads = await tx
          .select({
            id: industrialMessagingThreads.id,
            threadType: industrialMessagingThreads.threadType,
            title: industrialMessagingThreads.title,
            lastMessagePreview: industrialMessagingThreads.lastMessagePreview,
            lastMessageAt: industrialMessagingThreads.lastMessageAt,
          })
          .from(industrialMessagingThreads)
          .where(
            and(
              eq(industrialMessagingThreads.tenantId, tenantId),
              inArray(industrialMessagingThreads.id, threadIds),
              isNull(industrialMessagingThreads.archivedAt),
            ),
          )
          .orderBy(desc(industrialMessagingThreads.lastMessageAt));

        const activeIds = threads.map((t) => t.id);
        const unreadByThread = await this.unreadCountsForThreads(tx, tenantId, userId, activeIds);
        let totalUnread = 0;
        let focus: {
          threadId: string;
          threadType: string;
          title: string;
          lastMessagePreview: string;
          unreadCount: number;
        } | null = null;

        for (const thread of threads) {
          const unreadCount = unreadByThread.get(thread.id) ?? 0;
          totalUnread += unreadCount;
          if (!focus && unreadCount > 0) {
            focus = {
              threadId: thread.id,
              threadType: thread.threadType,
              title: thread.title?.trim() || "Messages",
              lastMessagePreview: thread.lastMessagePreview ?? "",
              unreadCount,
            };
          }
        }

        return { totalUnread, focus, available: true };
      },
      userId,
    );
  }

  async getThread(
    principal: ForgePrincipal,
    threadId: string,
    query: Record<string, string | undefined> = {},
  ) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;
    const limit = Math.min(Math.max(Number(query.limit ?? 100) || 100, 1), 200);
    const since = query.since ? new Date(query.since) : null;
    const hasSince = Boolean(since && !Number.isNaN(since.getTime()));

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const thread = await this.requireThreadMember(tx, tenantId, userId, threadId);
        const members = await this.loadThreadMemberSummaries(tx, tenantId, threadId);

        const messageConds = [
          eq(industrialMessagingMessages.threadId, threadId),
          eq(industrialMessagingMessages.tenantId, tenantId),
          isNull(industrialMessagingMessages.deletedAt),
        ];
        if (hasSince) {
          messageConds.push(gt(industrialMessagingMessages.createdAt, since!));
        }

        // Incremental polls: oldest-first after the cursor so we never skip a page.
        // Initial open: newest window first, then reverse to chronological for the UI.
        const messageRowsRaw = await tx
          .select()
          .from(industrialMessagingMessages)
          .where(and(...messageConds))
          .orderBy(
            hasSince
              ? industrialMessagingMessages.createdAt
              : desc(industrialMessagingMessages.createdAt),
          )
          .limit(limit);
        const messageRows = hasSince ? messageRowsRaw : [...messageRowsRaw].reverse();

        const messageIds = messageRows.map((m) => m.id);
        const attachmentsByMessage = await this.loadAttachmentsForMessages(
          tx,
          tenantId,
          messageIds,
        );
        const senderMap = await this.loadUserDisplayMap(
          tx,
          tenantId,
          messageRows.map((m) => m.senderUserId),
        );

        const messages = messageRows.map((m) => {
          const replyTo = readReplyToFromMetadata(m.metadataJson);
          return {
            id: m.id,
            body: m.body,
            messageType: m.messageType,
            senderUserId: m.senderUserId,
            senderName: senderMap.get(m.senderUserId) ?? PLATFORM_ADMIN_DISPLAY_NAME,
            createdAt: m.createdAt.toISOString(),
            editedAt: m.editedAt?.toISOString() ?? null,
            attachments: attachmentsByMessage.get(m.id) ?? [],
            isOwn: m.senderUserId === userId,
            ...(replyTo ? { replyTo } : {}),
          };
        });

        return {
          id: thread.id,
          threadType: thread.threadType,
          title: thread.title ?? this.resolveThreadTitle(thread, members, userId),
          description: thread.description,
          lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
          members,
          messages,
          hasMore: !hasSince && messageRowsRaw.length >= limit,
        };
      },
      userId,
    );
  }

  async listParticipants(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const rows = await tx
          .select({
            id: users.id,
            primaryEmail: users.primaryEmail,
            displayName: persons.displayName,
            firstName: persons.firstName,
            lastName: persons.lastName,
            lastActivityAt: users.lastActivityAt,
          })
          .from(userTenantMemberships)
          .innerJoin(users, eq(users.id, userTenantMemberships.userId))
          .leftJoin(persons, eq(persons.id, users.personId))
          .where(
            and(
              eq(userTenantMemberships.tenantId, tenantId),
              eq(userTenantMemberships.status, "ACTIVE"),
            ),
          )
          .orderBy(asc(users.primaryEmail));

        const personnelRows = await tx
          .select({
            email: industrialPersonnel.email,
            companyEmail: industrialPersonnel.companyEmail,
            employeeNumber: industrialPersonnel.employeeNumber,
            displayName: industrialPersonnel.displayName,
            firstName: industrialPersonnel.firstName,
            lastName: industrialPersonnel.lastName,
            divisionName: industrialPersonnel.divisionName,
            departmentName: industrialPersonnel.departmentName,
            siteId: industrialPersonnel.siteId,
            siteName: industrialSites.name,
          })
          .from(industrialPersonnel)
          .leftJoin(industrialSites, eq(industrialSites.id, industrialPersonnel.siteId))
          .where(eq(industrialPersonnel.tenantId, tenantId));

        const personnelByEmail = new Map<
          string,
          {
            employeeNumber: string;
            displayName: string;
            divisionName: string;
            departmentName: string;
            siteId: string;
            siteLabel: string;
          }
        >();
        for (const row of personnelRows) {
          const enrichment = {
            employeeNumber: String(row.employeeNumber ?? "").trim(),
            displayName: String(row.displayName ?? "").trim(),
            divisionName: String(row.divisionName ?? "").trim(),
            departmentName: String(row.departmentName ?? "").trim(),
            siteId: String(row.siteId ?? "").trim(),
            siteLabel: String(row.siteName ?? "").trim(),
          };
          for (const raw of [row.email, row.companyEmail]) {
            const key = String(raw ?? "")
              .trim()
              .toLowerCase();
            if (!key || personnelByEmail.has(key)) continue;
            personnelByEmail.set(key, enrichment);
          }
        }

        return rows.map((row) => {
          const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
          const email = String(row.primaryEmail ?? "").trim();
          const personnel = personnelByEmail.get(email.toLowerCase());
          const displayName = (
            personnel?.displayName ||
            row.displayName ||
            name ||
            email ||
            "User"
          ).trim();
          const lastSeenAt = row.lastActivityAt?.toISOString() ?? null;
          return {
            id: row.id,
            primaryEmail: row.primaryEmail,
            displayName,
            employeeNumber: personnel?.employeeNumber ?? "",
            divisionName: personnel?.divisionName ?? "",
            departmentName: personnel?.departmentName ?? "",
            siteId: personnel?.siteId ?? "",
            siteLabel: personnel?.siteLabel ?? "",
            lastSeenAt,
            isOnline: isOnlineFromActivity(row.lastActivityAt),
          };
        });
      },
      userId,
    );
  }

  async createThread(
    principal: ForgePrincipal,
    body: {
      threadType?: string;
      title?: string;
      description?: string;
      memberUserIds?: string[];
      participantUserIds?: string[];
    },
  ) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;
    const threadType = normalizeThreadType(body.threadType);
    const rawMemberIds = body.memberUserIds ?? body.participantUserIds ?? [];
    const memberUserIds = [
      ...new Set(
        (Array.isArray(rawMemberIds) ? rawMemberIds : [])
          .map((id) => String(id).trim())
          .filter(Boolean),
      ),
    ];

    if (threadType === "DIRECT") {
      if (memberUserIds.length !== 1) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Direct messages require exactly one other participant",
        );
      }
      if (memberUserIds[0] === userId) {
        throw new ForgeError("VALIDATION_FAILED", "Cannot start a direct message with yourself");
      }
    } else if (memberUserIds.length === 0) {
      throw new ForgeError("VALIDATION_FAILED", "At least one participant is required");
    }

    const allMemberIds = [...new Set([userId, ...memberUserIds])];

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.assertUsersInTenant(tx, tenantId, allMemberIds, { allowUserIds: [userId] });

        if (threadType === "DIRECT") {
          const existing = await this.findDirectThread(tx, tenantId, userId, memberUserIds[0]!);
          if (existing) {
            const thread = await tx.query.industrialMessagingThreads.findFirst({
              where: eq(industrialMessagingThreads.id, existing.id),
            });
            const members = await this.loadThreadMemberSummaries(tx, tenantId, existing.id);
            return {
              id: existing.id,
              threadType: "DIRECT",
              title:
                thread?.title ??
                this.resolveThreadTitle(
                  { threadType: "DIRECT", title: thread?.title ?? null },
                  members,
                  userId,
                ),
              description: thread?.description ?? null,
              lastMessageAt: thread?.lastMessageAt?.toISOString() ?? null,
              members,
              messages: [],
            };
          }
        }

        const now = new Date();
        const threadId = createId();
        const title = String(body.title ?? "").trim() || null;

        await tx.insert(industrialMessagingThreads).values({
          id: threadId,
          tenantId,
          threadType,
          title,
          description: String(body.description ?? "").trim() || null,
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });

        for (const memberId of allMemberIds) {
          await tx.insert(industrialMessagingThreadMembers).values({
            id: createId(),
            tenantId,
            threadId,
            userId: memberId,
            role: memberId === userId ? "OWNER" : "MEMBER",
            joinedAt: now,
            lastReadAt: memberId === userId ? now : null,
            createdAt: now,
            updatedAt: now,
          });
        }

        const members = await this.loadThreadMemberSummaries(tx, tenantId, threadId);
        return {
          id: threadId,
          threadType,
          title: title ?? this.resolveThreadTitle({ threadType, title }, members, userId),
          description: String(body.description ?? "").trim() || null,
          lastMessageAt: null,
          members,
          messages: [],
        };
      },
      userId,
    );
  }

  async updateThread(
    principal: ForgePrincipal,
    threadId: string,
    body: {
      title?: string;
      description?: string;
      memberUserIds?: string[];
      participantUserIds?: string[];
    },
  ) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const thread = await this.requireThreadMember(tx, tenantId, userId, threadId);
        if (String(thread.threadType).toUpperCase() !== "GROUP") {
          throw new ForgeError("VALIDATION_FAILED", "Only group conversations can be edited");
        }

        const now = new Date();
        const patch: {
          title?: string | null;
          description?: string | null;
          updatedAt: Date;
        } = { updatedAt: now };

        if (body.title !== undefined) {
          const title = String(body.title ?? "").trim();
          if (!title) {
            throw new ForgeError("VALIDATION_FAILED", "Group name is required");
          }
          patch.title = title;
        }
        if (body.description !== undefined) {
          patch.description = String(body.description ?? "").trim() || null;
        }

        await tx
          .update(industrialMessagingThreads)
          .set(patch)
          .where(
            and(
              eq(industrialMessagingThreads.id, threadId),
              eq(industrialMessagingThreads.tenantId, tenantId),
            ),
          );

        const rawMemberIds = body.memberUserIds ?? body.participantUserIds;
        if (rawMemberIds !== undefined) {
          const requested = [
            ...new Set(
              (Array.isArray(rawMemberIds) ? rawMemberIds : [])
                .map((id) => String(id).trim())
                .filter(Boolean),
            ),
          ];
          // Always keep the editor in the group.
          const desired = [...new Set([userId, ...requested])];
          await this.assertUsersInTenant(tx, tenantId, desired, { allowUserIds: [userId] });

          const existing = await tx
            .select({
              id: industrialMessagingThreadMembers.id,
              userId: industrialMessagingThreadMembers.userId,
              role: industrialMessagingThreadMembers.role,
            })
            .from(industrialMessagingThreadMembers)
            .where(
              and(
                eq(industrialMessagingThreadMembers.threadId, threadId),
                eq(industrialMessagingThreadMembers.tenantId, tenantId),
              ),
            );

          const existingIds = new Set(existing.map((row) => row.userId));
          const toRemove = existing
            .filter((row) => !desired.includes(row.userId))
            .map((row) => row.userId);
          const toAdd = desired.filter((id) => !existingIds.has(id));

          if (toRemove.length) {
            await tx
              .delete(industrialMessagingThreadMembers)
              .where(
                and(
                  eq(industrialMessagingThreadMembers.threadId, threadId),
                  eq(industrialMessagingThreadMembers.tenantId, tenantId),
                  inArray(industrialMessagingThreadMembers.userId, toRemove),
                ),
              );
          }

          for (const memberId of toAdd) {
            await tx.insert(industrialMessagingThreadMembers).values({
              id: createId(),
              tenantId,
              threadId,
              userId: memberId,
              role: "MEMBER",
              joinedAt: now,
              lastReadAt: null,
              createdAt: now,
              updatedAt: now,
            });
          }
        }

        const updated = await tx.query.industrialMessagingThreads.findFirst({
          where: and(
            eq(industrialMessagingThreads.id, threadId),
            eq(industrialMessagingThreads.tenantId, tenantId),
          ),
        });
        const members = await this.loadThreadMemberSummaries(tx, tenantId, threadId);
        return {
          id: threadId,
          threadType: "GROUP",
          title:
            updated?.title ??
            this.resolveThreadTitle(
              { threadType: "GROUP", title: updated?.title ?? null },
              members,
              userId,
            ),
          description: updated?.description ?? null,
          lastMessageAt: updated?.lastMessageAt?.toISOString() ?? null,
          memberCount: members.length,
          members,
        };
      },
      userId,
    );
  }

  async deleteThread(principal: ForgePrincipal, threadId: string) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const thread = await this.requireThreadMember(tx, tenantId, userId, threadId);
        if (String(thread.threadType).toUpperCase() !== "GROUP") {
          throw new ForgeError("VALIDATION_FAILED", "Only group conversations can be deleted");
        }

        const now = new Date();
        await tx
          .update(industrialMessagingThreads)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(industrialMessagingThreads.id, threadId),
              eq(industrialMessagingThreads.tenantId, tenantId),
            ),
          );

        return { id: threadId, archived: true };
      },
      userId,
    );
  }

  async sendMessage(principal: ForgePrincipal, threadId: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;
    const text = String(body.body ?? "").trim();
    const rawAttachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
    const attachmentIds = [
      ...new Set(rawAttachmentIds.map((id) => String(id).trim()).filter(Boolean)),
    ];
    const rawLinks = Array.isArray(body.links) ? body.links : [];
    const links = rawLinks
      .filter((l): l is LinkInput => Boolean(l) && typeof l === "object")
      .filter((l) => isValidHttpUrl(String(l.url ?? "").trim()));
    const replyToMessageId = String(body.replyToMessageId ?? "").trim();

    if (!text && attachmentIds.length === 0 && links.length === 0) {
      throw new ForgeError("VALIDATION_FAILED", "Message body, attachment, or link is required");
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireThreadMember(tx, tenantId, userId, threadId);

        let replyTo: MessagingReplyTo | null = null;
        if (replyToMessageId) {
          const [parent] = await tx
            .select({
              id: industrialMessagingMessages.id,
              body: industrialMessagingMessages.body,
              senderUserId: industrialMessagingMessages.senderUserId,
              deletedAt: industrialMessagingMessages.deletedAt,
            })
            .from(industrialMessagingMessages)
            .where(
              and(
                eq(industrialMessagingMessages.id, replyToMessageId),
                eq(industrialMessagingMessages.threadId, threadId),
                eq(industrialMessagingMessages.tenantId, tenantId),
              ),
            )
            .limit(1);
          if (!parent || parent.deletedAt) {
            throw new ForgeError(
              "VALIDATION_FAILED",
              "The message you are replying to was not found",
            );
          }
          const parentNames = await this.loadUserDisplayMap(tx, tenantId, [parent.senderUserId]);
          const parentAttachmentCount = await tx
            .select({ id: industrialMessagingAttachments.id })
            .from(industrialMessagingAttachments)
            .where(
              and(
                eq(industrialMessagingAttachments.messageId, parent.id),
                eq(industrialMessagingAttachments.tenantId, tenantId),
              ),
            )
            .limit(1);
          replyTo = {
            messageId: parent.id,
            senderUserId: parent.senderUserId,
            senderName:
              parentNames.get(parent.senderUserId) ??
              (principal.isPlatformAdmin ? PLATFORM_ADMIN_DISPLAY_NAME : "User"),
            bodyPreview: truncateReplyPreview(parent.body, parentAttachmentCount.length > 0),
          };
        }

        const now = new Date();
        const messageId = createId();

        await tx.insert(industrialMessagingMessages).values({
          id: messageId,
          tenantId,
          threadId,
          senderUserId: userId,
          body: text,
          messageType: "TEXT",
          metadataJson: replyTo ? { replyTo } : {},
          createdAt: now,
          updatedAt: now,
        });

        if (attachmentIds.length > 0) {
          const attachments = await tx
            .select()
            .from(industrialMessagingAttachments)
            .where(
              and(
                eq(industrialMessagingAttachments.tenantId, tenantId),
                eq(industrialMessagingAttachments.threadId, threadId),
                inArray(industrialMessagingAttachments.id, attachmentIds),
                isNull(industrialMessagingAttachments.messageId),
                eq(industrialMessagingAttachments.uploadStatus, "COMPLETE"),
              ),
            );

          if (attachments.length !== attachmentIds.length) {
            throw new ForgeError(
              "VALIDATION_FAILED",
              "One or more attachments are invalid or not ready",
            );
          }

          await tx
            .update(industrialMessagingAttachments)
            .set({ messageId, updatedAt: now })
            .where(inArray(industrialMessagingAttachments.id, attachmentIds));
        }

        for (const link of links) {
          await tx.insert(industrialMessagingAttachments).values({
            id: createId(),
            tenantId,
            threadId,
            messageId,
            attachmentType: "LINK",
            linkUrl: String(link.url).trim(),
            linkTitle: String(link.title ?? "").trim() || String(link.url).trim(),
            linkDescription: String(link.description ?? "").trim() || null,
            uploadStatus: "COMPLETE",
            createdByUserId: userId,
            createdAt: now,
            updatedAt: now,
          });
        }

        const hasAttachments = attachmentIds.length > 0 || links.length > 0;
        const preview = buildMessagePreview(text, hasAttachments);

        await tx
          .update(industrialMessagingThreads)
          .set({
            lastMessageAt: now,
            lastMessagePreview: preview,
            updatedAt: now,
          })
          .where(eq(industrialMessagingThreads.id, threadId));

        await tx
          .update(industrialMessagingThreadMembers)
          .set({ lastReadAt: now, updatedAt: now })
          .where(
            and(
              eq(industrialMessagingThreadMembers.threadId, threadId),
              eq(industrialMessagingThreadMembers.userId, userId),
            ),
          );

        const attachmentsByMessage = await this.loadAttachmentsForMessages(tx, tenantId, [
          messageId,
        ]);
        const senderMap = await this.loadUserDisplayMap(tx, tenantId, [userId]);
        const senderName =
          senderMap.get(userId) ??
          (principal.isPlatformAdmin ? PLATFORM_ADMIN_DISPLAY_NAME : "User");

        await this.notifyThreadMembers(tx, tenantId, threadId, userId, senderName, preview);

        return {
          id: messageId,
          body: text,
          messageType: "TEXT",
          senderUserId: userId,
          senderName,
          createdAt: now.toISOString(),
          editedAt: null,
          attachments: attachmentsByMessage.get(messageId) ?? [],
          isOwn: true,
          ...(replyTo ? { replyTo } : {}),
        };
      },
      userId,
    );
  }

  async markRead(principal: ForgePrincipal, threadId: string) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;

    const result = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireThreadMember(tx, tenantId, userId, threadId);
        const now = new Date();
        await tx
          .update(industrialMessagingThreadMembers)
          .set({ lastReadAt: now, updatedAt: now })
          .where(
            and(
              eq(industrialMessagingThreadMembers.threadId, threadId),
              eq(industrialMessagingThreadMembers.userId, userId),
            ),
          );
        return { ok: true, readAt: now.toISOString() };
      },
      userId,
    );

    try {
      await this.notifications.markUnreadByTypeAndThread(
        tenantId,
        userId,
        "industrial.messaging.new_message",
        threadId,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to mark messaging notifications read for thread ${threadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return result;
  }

  async createAttachmentUploadUrl(
    principal: ForgePrincipal,
    body: { threadId?: string; filename?: string; mimeType?: string; contentLength?: number },
  ) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;
    const threadId = String(body.threadId ?? "").trim();
    const filename = String(body.filename ?? "").trim();
    const mimeType = String(body.mimeType ?? "")
      .trim()
      .toLowerCase();
    const contentLength = Number(body.contentLength ?? 0);

    if (!threadId) throw new ForgeError("VALIDATION_FAILED", "threadId is required");
    if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
    if (!isAllowedMessagingMime(mimeType)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "File type not allowed. Use images, PDF, Office documents, or common file formats.",
      );
    }
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_MESSAGING_ATTACHMENT_BYTES
    ) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `contentLength must be between 1 and ${MAX_MESSAGING_ATTACHMENT_BYTES} bytes`,
      );
    }

    const storedFilename = this.storage.buildStoredFilename(filename);
    const objectKey = `${messagingObjectKeyPrefix(tenantId, threadId)}${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);

    const attachmentId = createId();
    const documentId = createId();
    const now = new Date();
    const attachmentType = messagingAttachmentTypeForMime(mimeType);

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireThreadMember(tx, tenantId, userId, threadId);

        await tx.insert(forgeDocuments).values({
          id: documentId,
          tenantId,
          originalFilename: filename,
          storedFilename,
          objectKey,
          bucketName: this.storage.bucketName,
          mimeType,
          fileSizeBytes: contentLength,
          uploadStatus: "INITIALIZED",
          source: "INDUSTRIAL_WEB",
          uploadedByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(industrialMessagingAttachments).values({
          id: attachmentId,
          tenantId,
          threadId,
          attachmentType,
          documentId,
          originalFilename: filename,
          mimeType,
          fileSizeBytes: contentLength,
          uploadStatus: "PENDING",
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
      },
      userId,
    );

    const presign = await this.storage.createPresignedUploadUrl({
      objectKey,
      mimeType,
      contentLength,
    });

    return {
      attachmentId,
      documentId,
      objectKey,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mode: presign.mode,
      attachmentType,
      originalFilename: filename,
      mimeType,
    };
  }

  async completeAttachmentUpload(principal: ForgePrincipal, attachmentId: string) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const attachment = await tx.query.industrialMessagingAttachments.findFirst({
          where: and(
            eq(industrialMessagingAttachments.id, attachmentId),
            eq(industrialMessagingAttachments.tenantId, tenantId),
          ),
        });
        if (!attachment || !attachment.documentId) {
          throw new ForgeError("NOT_FOUND", "Attachment not found");
        }
        await this.requireThreadMember(tx, tenantId, userId, attachment.threadId);

        const document = await tx.query.forgeDocuments.findFirst({
          where: and(
            eq(forgeDocuments.id, attachment.documentId),
            eq(forgeDocuments.tenantId, tenantId),
          ),
        });
        if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
        if (!documentBelongsToTenant(document.tenantId, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
        }
        if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
        }

        await this.storage.assertObjectExists(document.objectKey);

        const now = new Date();
        await tx
          .update(forgeDocuments)
          .set({ uploadStatus: "COMPLETE", uploadedAt: now, updatedAt: now })
          .where(eq(forgeDocuments.id, document.id));

        const [updated] = await tx
          .update(industrialMessagingAttachments)
          .set({ uploadStatus: "COMPLETE", updatedAt: now })
          .where(eq(industrialMessagingAttachments.id, attachmentId))
          .returning();

        return {
          id: updated!.id,
          attachmentType: updated!.attachmentType,
          originalFilename: updated!.originalFilename,
          mimeType: updated!.mimeType,
          fileSizeBytes: updated!.fileSizeBytes,
          uploadStatus: updated!.uploadStatus,
        };
      },
      userId,
    );
  }

  async createAttachmentDownloadUrl(principal: ForgePrincipal, attachmentId: string) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId;

    const { attachment, document } = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const attachment = await tx.query.industrialMessagingAttachments.findFirst({
          where: and(
            eq(industrialMessagingAttachments.id, attachmentId),
            eq(industrialMessagingAttachments.tenantId, tenantId),
          ),
        });
        if (!attachment || !attachment.documentId) {
          throw new ForgeError("NOT_FOUND", "Attachment not found");
        }
        await this.requireThreadMember(tx, tenantId, userId, attachment.threadId);
        if (attachment.uploadStatus !== "COMPLETE") {
          throw new ForgeError("VALIDATION_FAILED", "Attachment upload is not complete");
        }

        const document = await tx.query.forgeDocuments.findFirst({
          where: and(
            eq(forgeDocuments.id, attachment.documentId!),
            eq(forgeDocuments.tenantId, tenantId),
          ),
        });
        if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
        return { attachment, document };
      },
      userId,
    );

    await this.storage.assertObjectExists(document.objectKey);
    const inline = canStreamInline(attachment.mimeType ?? document.mimeType);

    const presign = await this.storage.createPresignedDownloadUrl({
      objectKey: document.objectKey,
      mimeType: document.mimeType,
      filename: attachment.originalFilename ?? document.originalFilename,
      inline,
    });
    this.storage.assertDownloadNotExpired(presign.expiresAt);

    return {
      id: attachment.id,
      attachmentType: attachment.attachmentType,
      originalFilename: attachment.originalFilename ?? document.originalFilename,
      mimeType: attachment.mimeType ?? document.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
      downloadUrl: presign.downloadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      expiresAt: presign.expiresAt,
      inline,
    };
  }

  /** Stream attachment bytes through the API (same-origin, avoids S3 img/CORS failures). */
  async getAttachmentContent(principal: ForgePrincipal, attachmentId: string) {
    const tenantId = principal.tenantId;
    const userId = principal.userId;

    const { attachment, document } = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.industrialMessagingAttachments.findFirst({
          where: and(
            eq(industrialMessagingAttachments.id, attachmentId),
            eq(industrialMessagingAttachments.tenantId, tenantId),
          ),
        });
        if (!row || !row.documentId) {
          throw new ForgeError("NOT_FOUND", "Attachment not found");
        }
        await this.requireThreadMember(tx, tenantId, userId, row.threadId);
        if (row.uploadStatus !== "COMPLETE") {
          throw new ForgeError("VALIDATION_FAILED", "Attachment upload is not complete");
        }

        const doc = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, row.documentId!), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!doc) throw new ForgeError("NOT_FOUND", "Document not found");
        return { attachment: row, document: doc };
      },
      userId,
    );

    const stream = await this.storage.getObjectStream(document.objectKey);
    const mimeType =
      attachment.mimeType ?? document.mimeType ?? stream.contentType ?? "application/octet-stream";
    const inline = canStreamInline(mimeType);
    return {
      body: stream.body,
      contentType: stream.contentType ?? mimeType,
      contentLength: stream.contentLength ?? attachment.fileSizeBytes ?? undefined,
      filename: attachment.originalFilename ?? document.originalFilename ?? "attachment",
      disposition: inline ? ("inline" as const) : ("attachment" as const),
    };
  }

  private async requireThreadMember(
    tx: DatabaseTransaction,
    tenantId: string,
    userId: string,
    threadId: string,
  ) {
    const thread = await tx.query.industrialMessagingThreads.findFirst({
      where: and(
        eq(industrialMessagingThreads.id, threadId),
        eq(industrialMessagingThreads.tenantId, tenantId),
        isNull(industrialMessagingThreads.archivedAt),
      ),
    });
    if (!thread) throw new ForgeError("NOT_FOUND", "Conversation not found");

    const membership = await tx.query.industrialMessagingThreadMembers.findFirst({
      where: and(
        eq(industrialMessagingThreadMembers.threadId, threadId),
        eq(industrialMessagingThreadMembers.userId, userId),
        eq(industrialMessagingThreadMembers.tenantId, tenantId),
      ),
    });
    if (!membership) throw new ForgeError("FORBIDDEN", "You are not a member of this conversation");
    return thread;
  }

  private async findDirectThread(
    tx: DatabaseTransaction,
    tenantId: string,
    userA: string,
    userB: string,
  ): Promise<{ id: string } | null> {
    const rows = await tx.execute(sql`
      SELECT t.id
      FROM industrial_messaging_threads t
      INNER JOIN industrial_messaging_thread_members m1
        ON m1.thread_id = t.id AND m1.user_id = ${userA}::uuid
      INNER JOIN industrial_messaging_thread_members m2
        ON m2.thread_id = t.id AND m2.user_id = ${userB}::uuid
      WHERE t.tenant_id = ${tenantId}::uuid
        AND t.thread_type = 'DIRECT'
        AND t.archived_at IS NULL
      LIMIT 1
    `);
    const row = (
      Array.isArray(rows) ? rows[0] : (rows as { rows?: Array<{ id: string }> }).rows?.[0]
    ) as { id: string } | undefined;
    return row ?? null;
  }

  private async assertUsersInTenant(
    tx: DatabaseTransaction,
    tenantId: string,
    userIds: string[],
    options?: { allowUserIds?: string[] },
  ) {
    const allowed = new Set((options?.allowUserIds ?? []).filter(Boolean));
    const unique = [...new Set(userIds)].filter((id) => !allowed.has(id));
    if (unique.length === 0) return;

    // Memberships are the tenant access source of truth. users.tenant_id is the
    // home tenant and may differ for users with multi-tenant memberships.
    // The authenticated principal is always allowed (platform admins may operate
    // in a tenant without a local membership row).
    const rows = await tx
      .select({ userId: userTenantMemberships.userId })
      .from(userTenantMemberships)
      .where(
        and(
          eq(userTenantMemberships.tenantId, tenantId),
          eq(userTenantMemberships.status, "ACTIVE"),
          inArray(userTenantMemberships.userId, unique),
        ),
      );
    const found = new Set(rows.map((row) => row.userId));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "One or more participants were not found in this tenant",
        { details: [{ missingUserIds: missing }] },
      );
    }
  }

  private async loadThreadMemberSummaries(
    tx: DatabaseTransaction,
    tenantId: string,
    threadId: string,
  ) {
    const byThread = await this.loadThreadMemberSummariesForThreads(tx, tenantId, [threadId]);
    return byThread.get(threadId) ?? [];
  }

  private async loadThreadMemberSummariesForThreads(
    tx: DatabaseTransaction,
    tenantId: string,
    threadIds: string[],
  ) {
    const result = new Map<
      string,
      Array<{
        userId: string;
        role: string;
        displayName: string;
        email?: string;
        lastReadAt: string | null;
        lastSeenAt: string | null;
        isOnline: boolean;
      }>
    >();
    if (threadIds.length === 0) return result;

    const rows = await tx
      .select({
        threadId: industrialMessagingThreadMembers.threadId,
        userId: industrialMessagingThreadMembers.userId,
        role: industrialMessagingThreadMembers.role,
        lastReadAt: industrialMessagingThreadMembers.lastReadAt,
        email: users.primaryEmail,
        username: users.username,
        displayName: persons.displayName,
        firstName: persons.firstName,
        lastName: persons.lastName,
        lastActivityAt: users.lastActivityAt,
      })
      .from(industrialMessagingThreadMembers)
      .leftJoin(users, eq(users.id, industrialMessagingThreadMembers.userId))
      .leftJoin(persons, eq(persons.id, users.personId))
      .where(
        and(
          eq(industrialMessagingThreadMembers.tenantId, tenantId),
          inArray(industrialMessagingThreadMembers.threadId, threadIds),
        ),
      );

    const missingIds = rows
      .filter((row) => !row.email && !row.displayName)
      .map((row) => row.userId);
    const bypassPresence = missingIds.length
      ? await this.loadUserPresenceMapBypass(missingIds)
      : new Map<string, { displayName: string; lastActivityAt: Date | null }>();

    for (const r of rows) {
      const fromTenant = formatUserDisplayName({
        displayName: r.displayName,
        firstName: r.firstName,
        lastName: r.lastName,
        username: r.username,
        email: r.email,
        fallback: "",
      });
      const bypass = bypassPresence.get(r.userId);
      const lastActivityAt = r.lastActivityAt ?? bypass?.lastActivityAt ?? null;
      const lastSeenAt = lastActivityAt?.toISOString() ?? null;
      const email = r.email ?? undefined;
      const member = {
        userId: r.userId,
        role: String(r.role ?? "MEMBER"),
        displayName: fromTenant || bypass?.displayName || PLATFORM_ADMIN_DISPLAY_NAME,
        lastReadAt: r.lastReadAt?.toISOString() ?? null,
        lastSeenAt,
        isOnline: isOnlineFromActivity(lastActivityAt),
        ...(email ? { email } : {}),
      };
      const list = result.get(r.threadId) ?? [];
      list.push(member);
      result.set(r.threadId, list);
    }
    return result;
  }

  private async loadUserDisplayMap(tx: DatabaseTransaction, _tenantId: string, userIds: string[]) {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map<string, string>();

    const rows = await tx
      .select({
        userId: users.id,
        email: users.primaryEmail,
        username: users.username,
        displayName: persons.displayName,
        firstName: persons.firstName,
        lastName: persons.lastName,
      })
      .from(users)
      .leftJoin(persons, eq(persons.id, users.personId))
      .where(inArray(users.id, unique));

    const map = new Map(
      rows.map((r) => [
        r.userId,
        formatUserDisplayName({
          displayName: r.displayName,
          firstName: r.firstName,
          lastName: r.lastName,
          username: r.username,
          email: r.email,
        }),
      ]),
    );

    const missing = unique.filter((id) => !map.has(id));
    if (missing.length === 0) return map;

    // Creator / platform-admin users live on the platform tenant; RLS in a customer
    // tenant hides their users/persons rows. Resolve only the missing ids.
    const bypassNames = await this.loadUserDisplayMapBypass(missing);
    for (const [userId, name] of bypassNames) {
      map.set(userId, name);
    }
    for (const userId of missing) {
      if (!map.has(userId)) map.set(userId, PLATFORM_ADMIN_DISPLAY_NAME);
    }
    return map;
  }

  private async loadUserDisplayMapBypass(userIds: string[]) {
    const presence = await this.loadUserPresenceMapBypass(userIds);
    return new Map([...presence.entries()].map(([userId, row]) => [userId, row.displayName]));
  }

  private async loadUserPresenceMapBypass(userIds: string[]) {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) {
      return new Map<string, { displayName: string; lastActivityAt: Date | null }>();
    }

    return withBypassRlsTransaction(this.db, async (tx) => {
      const rows = await tx
        .select({
          userId: users.id,
          email: users.primaryEmail,
          username: users.username,
          displayName: persons.displayName,
          firstName: persons.firstName,
          lastName: persons.lastName,
          lastActivityAt: users.lastActivityAt,
        })
        .from(users)
        .leftJoin(persons, eq(persons.id, users.personId))
        .where(inArray(users.id, unique));

      return new Map(
        rows.map((r) => [
          r.userId,
          {
            displayName: formatUserDisplayName({
              displayName: r.displayName,
              firstName: r.firstName,
              lastName: r.lastName,
              username: r.username,
              email: r.email,
              fallback: PLATFORM_ADMIN_DISPLAY_NAME,
            }),
            lastActivityAt: r.lastActivityAt ?? null,
          },
        ]),
      );
    });
  }

  private async loadAttachmentsForMessages(
    tx: DatabaseTransaction,
    tenantId: string,
    messageIds: string[],
  ) {
    const map = new Map<string, ReturnType<typeof this.formatAttachment>[]>();
    if (messageIds.length === 0) return map;

    const rows = await tx
      .select()
      .from(industrialMessagingAttachments)
      .where(
        and(
          eq(industrialMessagingAttachments.tenantId, tenantId),
          inArray(industrialMessagingAttachments.messageId, messageIds),
        ),
      );

    for (const row of rows) {
      const list = map.get(row.messageId!) ?? [];
      list.push(this.formatAttachment(row));
      map.set(row.messageId!, list);
    }
    return map;
  }

  private formatAttachment(row: typeof industrialMessagingAttachments.$inferSelect) {
    return {
      id: row.id,
      attachmentType: row.attachmentType,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes,
      linkUrl: row.linkUrl,
      linkTitle: row.linkTitle,
      linkDescription: row.linkDescription,
      uploadStatus: row.uploadStatus,
    };
  }

  private resolveThreadTitle(
    thread: { threadType: string; title: string | null },
    members: { userId: string; displayName: string }[],
    currentUserId: string,
  ): string {
    if (thread.title?.trim()) return thread.title.trim();
    if (thread.threadType === "DIRECT") {
      const other = members.find((m) => m.userId !== currentUserId);
      return other?.displayName ?? "Direct message";
    }
    const names = members
      .filter((m) => m.userId !== currentUserId)
      .map((m) => m.displayName)
      .slice(0, 3);
    if (names.length === 0) return "Group conversation";
    if (members.length > 4) return `${names.join(", ")} +${members.length - 4}`;
    return names.join(", ");
  }

  private async unreadCountForThread(
    tx: DatabaseTransaction,
    tenantId: string,
    userId: string,
    threadId: string,
  ): Promise<number> {
    const map = await this.unreadCountsForThreads(tx, tenantId, userId, [threadId]);
    return map.get(threadId) ?? 0;
  }

  private async unreadCountsForThreads(
    tx: DatabaseTransaction,
    tenantId: string,
    userId: string,
    threadIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (threadIds.length === 0) return result;

    const threadIdList = sql.join(
      threadIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const rows = await tx.execute(sql`
      select m.thread_id as "threadId", count(*)::int as count
      from industrial_messaging_messages m
      inner join industrial_messaging_thread_members mem
        on mem.thread_id = m.thread_id
       and mem.tenant_id = m.tenant_id
       and mem.user_id = ${userId}::uuid
      where m.tenant_id = ${tenantId}::uuid
        and m.thread_id in (${threadIdList})
        and m.deleted_at is null
        and (mem.last_read_at is null or m.created_at > mem.last_read_at)
      group by m.thread_id
    `);

    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    for (const row of list as Array<{ threadId?: string; count?: number }>) {
      if (row.threadId) result.set(String(row.threadId), Number(row.count ?? 0));
    }
    return result;
  }

  private async notifyThreadMembers(
    tx: DatabaseTransaction,
    tenantId: string,
    threadId: string,
    senderUserId: string,
    senderName: string,
    preview: string,
  ) {
    const members = await tx
      .select({ userId: industrialMessagingThreadMembers.userId })
      .from(industrialMessagingThreadMembers)
      .where(
        and(
          eq(industrialMessagingThreadMembers.threadId, threadId),
          eq(industrialMessagingThreadMembers.tenantId, tenantId),
        ),
      );

    for (const member of members) {
      if (member.userId === senderUserId) continue;
      try {
        await this.notifications.create(
          tenantId,
          {
            userId: member.userId,
            type: "industrial.messaging.new_message",
            title: `New message from ${senderName}`,
            body: preview || "You have a new message",
            priority: "NORMAL",
            destination: "IN_APP",
            href: `/modules/messaging/?thread=${threadId}`,
            metadataJson: { threadId, senderUserId, senderName },
          },
          { userId: senderUserId, tenantId } as ForgePrincipal,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to notify messaging recipient ${member.userId} on thread ${threadId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
