import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import {
  createId,
  industrialPersonnel,
  industrialSites,
  industrialTrainingAssignmentAssignees,
  industrialTrainingAssignments,
  industrialTrainingAttempts,
  industrialTrainingGroupMembers,
  industrialTrainingGroups,
  industrialTrainingRecords,
  industrialTrainingSources,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  canonicalEmployeeNumber,
  employeeNumberLookupKeys,
  findPersonnelByEmployeeNumber as queryPersonnelByEmployeeNumber,
  indexByEmployeeNumberAliases,
} from "./employee-number.js";
import { notifyTrainingAssigned } from "./notify-training-assigned.js";
import { parseContentDelivery, parseContentPresentedAt } from "./industrial-training-delivery.js";
import { qrCodePngBuffer } from "./qr-svg.js";
import { IndustrialTrainingLmsService } from "./industrial-training-lms.service.js";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type ListQuery = Record<string, string | undefined>;

function pageParams(query: ListQuery) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function uniqueUserIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function uniqueStrings(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

type GroupMemberInput = {
  memberUserIds?: string[];
  memberPersonnelIds?: string[];
};

type ResolvedGroupMembers = {
  memberCount: number;
  memberUserIds: string[];
  memberPersonnelIds: string[];
};

type AssigneeSeed = { employeeNumber: string; personnelId: string | null };

@Injectable()
export class IndustrialTrainingAssignmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly lms: IndustrialTrainingLmsService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  async listGroups(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const groups = await tx
        .select()
        .from(industrialTrainingGroups)
        .where(
          and(
            eq(industrialTrainingGroups.tenantId, tenantId),
            isNull(industrialTrainingGroups.archivedAt),
          ),
        )
        .orderBy(desc(industrialTrainingGroups.updatedAt));
      const members = groups.length
        ? await tx
            .select()
            .from(industrialTrainingGroupMembers)
            .where(
              and(
                eq(industrialTrainingGroupMembers.tenantId, tenantId),
                inArray(
                  industrialTrainingGroupMembers.groupId,
                  groups.map((g) => g.id),
                ),
              ),
            )
        : [];
      const legacyUserIds = [
        ...new Set(
          members
            .filter((member) => member.userId && !member.personnelId)
            .map((member) => member.userId!)
            .filter(Boolean),
        ),
      ];
      const personnelByUserId = new Map<string, string>();
      if (legacyUserIds.length) {
        const linkedPeople = await tx
          .select({
            id: industrialPersonnel.id,
            userAuthId: industrialPersonnel.userAuthId,
          })
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.tenantId, tenantId),
              inArray(industrialPersonnel.userAuthId, legacyUserIds),
              isNull(industrialPersonnel.archivedAt),
            ),
          );
        for (const person of linkedPeople) {
          if (person.userAuthId) personnelByUserId.set(person.userAuthId, person.id);
        }
      }
      return groups.map((g) => {
        const groupMembers = members.filter((member) => member.groupId === g.id);
        const memberUserIds = groupMembers
          .map((member) => member.userId)
          .filter((id): id is string => Boolean(id));
        const memberPersonnelIds = [
          ...new Set(
            groupMembers.flatMap((member) => {
              if (member.personnelId) return [member.personnelId];
              if (member.userId) {
                const resolved = personnelByUserId.get(member.userId);
                return resolved ? [resolved] : [];
              }
              return [];
            }),
          ),
        ];
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          memberCount: groupMembers.length,
          memberUserIds,
          memberPersonnelIds,
          updatedAt: g.updatedAt,
        };
      });
    });
  }

  async createGroup(
    principal: ForgePrincipal,
    body: {
      name?: string;
      description?: string;
      memberUserIds?: string[];
      memberPersonnelIds?: string[];
    },
  ) {
    const tenantId = this.tenant(principal);
    const name = String(body.name ?? "").trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const groupId = createId();
      await tx.insert(industrialTrainingGroups).values({
        id: groupId,
        tenantId,
        name,
        description: body.description?.trim() || null,
        createdByUserId: principal.userId,
        createdAt: now,
        updatedAt: now,
      });
      const resolved = await this.replaceGroupMembers(tx, tenantId, groupId, now, body);
      return {
        id: groupId,
        name,
        description: body.description?.trim() || null,
        memberCount: resolved.memberCount,
        memberUserIds: resolved.memberUserIds,
        memberPersonnelIds: resolved.memberPersonnelIds,
      };
    });
  }

  async updateGroup(
    principal: ForgePrincipal,
    groupId: string,
    body: {
      name?: string;
      description?: string | null;
      memberUserIds?: string[];
      memberPersonnelIds?: string[];
    },
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingGroups.findFirst({
        where: and(
          eq(industrialTrainingGroups.id, groupId),
          eq(industrialTrainingGroups.tenantId, tenantId),
          isNull(industrialTrainingGroups.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Group not found");
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingGroups)
        .set({
          name: body.name?.trim() || existing.name,
          description:
            body.description !== undefined
              ? body.description?.trim() || null
              : existing.description,
          updatedAt: now,
        })
        .where(eq(industrialTrainingGroups.id, groupId))
        .returning();
      let resolved: ResolvedGroupMembers = {
        memberCount: 0,
        memberUserIds: [],
        memberPersonnelIds: [],
      };
      if (body.memberUserIds !== undefined || body.memberPersonnelIds !== undefined) {
        resolved = await this.replaceGroupMembers(tx, tenantId, groupId, now, body);
      } else {
        const members = await tx
          .select()
          .from(industrialTrainingGroupMembers)
          .where(
            and(
              eq(industrialTrainingGroupMembers.groupId, groupId),
              eq(industrialTrainingGroupMembers.tenantId, tenantId),
            ),
          );
        resolved = {
          memberCount: members.length,
          memberUserIds: members
            .map((member) => member.userId)
            .filter((id): id is string => Boolean(id)),
          memberPersonnelIds: members
            .map((member) => member.personnelId)
            .filter((id): id is string => Boolean(id)),
        };
      }
      return {
        id: row!.id,
        name: row!.name,
        description: row!.description,
        memberCount: resolved.memberCount,
        memberUserIds: resolved.memberUserIds,
        memberPersonnelIds: resolved.memberPersonnelIds,
      };
    });
  }

  private async replaceGroupMembers(
    tx: DatabaseTransaction,
    tenantId: string,
    groupId: string,
    now: Date,
    input: GroupMemberInput,
  ): Promise<ResolvedGroupMembers> {
    await tx
      .delete(industrialTrainingGroupMembers)
      .where(
        and(
          eq(industrialTrainingGroupMembers.groupId, groupId),
          eq(industrialTrainingGroupMembers.tenantId, tenantId),
        ),
      );

    const memberUserIds = uniqueUserIds(input.memberUserIds ?? []);
    const memberPersonnelIds = uniqueStrings(input.memberPersonnelIds ?? []);
    const rows: Array<{
      id: string;
      tenantId: string;
      groupId: string;
      userId: string | null;
      personnelId: string | null;
      createdAt: Date;
    }> = [];

    for (const userId of memberUserIds) {
      rows.push({
        id: createId(),
        tenantId,
        groupId,
        userId,
        personnelId: null,
        createdAt: now,
      });
    }

    if (memberPersonnelIds.length) {
      const people = await tx
        .select({ id: industrialPersonnel.id })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            inArray(industrialPersonnel.id, memberPersonnelIds),
            isNull(industrialPersonnel.archivedAt),
          ),
        );
      const allowed = new Set(people.map((person: { id: string }) => person.id));
      for (const personnelId of memberPersonnelIds) {
        if (!allowed.has(personnelId)) continue;
        rows.push({
          id: createId(),
          tenantId,
          groupId,
          userId: null,
          personnelId,
          createdAt: now,
        });
      }
    }

    if (rows.length) {
      await tx.insert(industrialTrainingGroupMembers).values(rows);
    }

    return {
      memberCount: rows.length,
      memberUserIds,
      memberPersonnelIds: rows
        .map((row) => row.personnelId)
        .filter((id): id is string => Boolean(id)),
    };
  }

  async archiveGroup(principal: ForgePrincipal, groupId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingGroups)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(industrialTrainingGroups.id, groupId),
            eq(industrialTrainingGroups.tenantId, tenantId),
            isNull(industrialTrainingGroups.archivedAt),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Group not found");
      return { id: row.id };
    });
  }

  async listAssignments(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const canManage =
      principal.permissions.has("industrial.training.manage") ||
      principal.permissions.has("industrial.admin");
    const { page, pageSize, offset } = pageParams(query);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conds = [
        eq(industrialTrainingAssignments.tenantId, tenantId),
        isNull(industrialTrainingAssignments.archivedAt),
        eq(industrialTrainingAssignments.status, "ACTIVE"),
      ];
      if (!canManage) {
        const employeeNumber = await this.resolveEmployeeNumberForUser(
          tx,
          tenantId,
          principal.userId,
        );
        if (!employeeNumber) return { items: [], page, pageSize };
        const mine = await tx
          .select({ assignmentId: industrialTrainingAssignmentAssignees.assignmentId })
          .from(industrialTrainingAssignmentAssignees)
          .where(
            and(
              eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
              sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${employeeNumber})`,
            ),
          );
        const ids = [...new Set(mine.map((m) => m.assignmentId))];
        if (!ids.length) return { items: [], page, pageSize };
        conds.push(inArray(industrialTrainingAssignments.id, ids));
      }
      const rows = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(and(...conds))
        .orderBy(desc(industrialTrainingAssignments.updatedAt))
        .limit(pageSize)
        .offset(offset);
      const items = await this.hydrateAssignments(tx, tenantId, rows, principal.userId, canManage);
      return { items, page, pageSize };
    });
  }

  async getAssignment(principal: ForgePrincipal, assignmentId: string) {
    const tenantId = this.tenant(principal);
    const id = String(assignmentId ?? "").trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "assignmentId is required");
    const canManage =
      principal.permissions.has("industrial.training.manage") ||
      principal.permissions.has("industrial.admin");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.industrialTrainingAssignments.findFirst({
        where: and(
          eq(industrialTrainingAssignments.tenantId, tenantId),
          eq(industrialTrainingAssignments.id, id),
          isNull(industrialTrainingAssignments.archivedAt),
        ),
      });
      if (!row) throw new ForgeError("NOT_FOUND", "Assignment not found");

      if (!canManage) {
        const employeeNumber = await this.resolveEmployeeNumberForUser(
          tx,
          tenantId,
          principal.userId,
        );
        if (!employeeNumber) throw new ForgeError("NOT_FOUND", "Assignment not found");
        const [assignee] = await tx
          .select({ id: industrialTrainingAssignmentAssignees.id })
          .from(industrialTrainingAssignmentAssignees)
          .where(
            and(
              eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
              eq(industrialTrainingAssignmentAssignees.assignmentId, id),
              sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${employeeNumber})`,
            ),
          )
          .limit(1);
        if (!assignee) throw new ForgeError("NOT_FOUND", "Assignment not found");
      }

      const [hydrated] = await this.hydrateAssignments(
        tx,
        tenantId,
        [row],
        principal.userId,
        canManage,
      );
      if (!hydrated) throw new ForgeError("NOT_FOUND", "Assignment not found");
      return hydrated;
    });
  }

  async createAssignment(
    principal: ForgePrincipal,
    body: {
      title?: string;
      description?: string;
      sourceId?: string;
      materialId?: string | null;
      dueAt?: string | null;
      passingPercent?: number;
      quizMode?: string;
      optionCount?: number;
      feedbackEnabled?: boolean;
      timerSeconds?: number | null;
      contentDelivery?: string;
      contentPresentedAt?: string | null;
      assigneeEmployeeNumbers?: string[];
      groupIds?: string[];
    },
  ) {
    const tenantId = this.tenant(principal);
    const title = String(body.title ?? "").trim();
    const contentDelivery = parseContentDelivery(body.contentDelivery);
    const sourceId = String(body.sourceId ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    if (!sourceId) throw new ForgeError("VALIDATION_FAILED", "sourceId is required");

    const groupIds = Array.isArray(body.groupIds)
      ? body.groupIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    const created = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const source = await tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
          isNull(industrialTrainingSources.archivedAt),
        ),
      });
      if (!source || source.status !== "PUBLISHED") {
        throw new ForgeError("VALIDATION_FAILED", "Source must be published");
      }

      const assigneeRows = await this.buildAssigneeRows(tx, tenantId, {
        employeeNumbers: body.assigneeEmployeeNumbers ?? [],
        groupIds,
      });
      if (!assigneeRows.length) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "At least one assignee with an employee number is required",
        );
      }

      const now = new Date();
      const assignmentId = createId();
      const passingPercent = Math.min(100, Math.max(1, Number(body.passingPercent ?? 70) || 70));
      const quizMode =
        String(body.quizMode ?? "STANDARD").toUpperCase() === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD";
      const optionCount = Math.min(4, Math.max(2, Number(body.optionCount ?? 4) || 4));
      const dueAt = body.dueAt ? new Date(body.dueAt) : null;
      if (dueAt && Number.isNaN(dueAt.getTime())) {
        throw new ForgeError("VALIDATION_FAILED", "dueAt is invalid");
      }

      await tx.insert(industrialTrainingAssignments).values({
        id: assignmentId,
        tenantId,
        title,
        description: body.description?.trim() || null,
        sourceId,
        materialId: body.materialId ? String(body.materialId).trim() : null,
        dueAt,
        passingPercent,
        quizMode,
        optionCount,
        feedbackEnabled: body.feedbackEnabled !== false,
        timerSeconds: body.timerSeconds == null ? null : Number(body.timerSeconds),
        contentDelivery,
        contentPresentedAt: parseContentPresentedAt(contentDelivery, body.contentPresentedAt, now),
        status: "ACTIVE",
        createdByUserId: principal.userId,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(industrialTrainingAssignmentAssignees).values(
        assigneeRows.map((row) => ({
          id: createId(),
          tenantId,
          assignmentId,
          userId: null,
          personnelId: row.personnelId,
          employeeNumber: row.employeeNumber,
          status: "NOT_STARTED",
          createdAt: now,
          updatedAt: now,
        })),
      );

      const [row] = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(eq(industrialTrainingAssignments.id, assignmentId));
      const items = await this.hydrateAssignments(tx, tenantId, [row!], principal.userId);
      return {
        item: items[0],
        notifyPersonnelIds: assigneeRows
          .map((row) => row.personnelId)
          .filter((id): id is string => Boolean(id?.trim())),
      };
    });

    if (created.item?.id) {
      await notifyTrainingAssigned(this.db, this.notifications, principal, {
        assignmentId: created.item.id,
        title: String(created.item.title ?? title),
        personnelIds: created.notifyPersonnelIds,
      });
    }
    return created.item;
  }

  async updateAssignment(
    principal: ForgePrincipal,
    assignmentId: string,
    body: {
      title?: string;
      description?: string | null;
      materialId?: string | null;
      dueAt?: string | null;
      passingPercent?: number;
      quizMode?: string;
      optionCount?: number;
      feedbackEnabled?: boolean;
      timerSeconds?: number | null;
      contentDelivery?: string;
      contentPresentedAt?: string | null;
      assigneeEmployeeNumbers?: string[];
    },
  ) {
    const tenantId = this.tenant(principal);
    const updated = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingAssignments.findFirst({
        where: and(
          eq(industrialTrainingAssignments.id, assignmentId),
          eq(industrialTrainingAssignments.tenantId, tenantId),
          isNull(industrialTrainingAssignments.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Assignment not found");

      const now = new Date();
      const patch: Record<string, unknown> = { updatedAt: now };
      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
        patch.title = title;
      }
      if (body.description !== undefined) {
        patch.description = body.description?.trim() || null;
      }
      if (body.materialId !== undefined) {
        patch.materialId = body.materialId ? String(body.materialId).trim() : null;
      }
      if (body.dueAt !== undefined) {
        patch.dueAt = body.dueAt ? new Date(body.dueAt) : null;
      }
      if (body.passingPercent !== undefined) {
        patch.passingPercent = Math.min(100, Math.max(1, Number(body.passingPercent) || 70));
      }
      if (body.quizMode !== undefined) {
        patch.quizMode =
          String(body.quizMode).toUpperCase() === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD";
      }
      if (body.optionCount !== undefined) {
        patch.optionCount = Math.min(4, Math.max(2, Number(body.optionCount) || 4));
      }
      if (body.feedbackEnabled !== undefined) {
        patch.feedbackEnabled = body.feedbackEnabled !== false;
      }
      if (body.timerSeconds !== undefined) {
        patch.timerSeconds = body.timerSeconds == null ? null : Number(body.timerSeconds);
      }
      if (body.contentDelivery !== undefined || body.contentPresentedAt !== undefined) {
        const delivery =
          body.contentDelivery !== undefined
            ? parseContentDelivery(body.contentDelivery)
            : parseContentDelivery(existing.contentDelivery);
        patch.contentDelivery = delivery;
        patch.contentPresentedAt = parseContentPresentedAt(
          delivery,
          body.contentPresentedAt !== undefined
            ? body.contentPresentedAt
            : existing.contentPresentedAt?.toISOString(),
          now,
        );
      }

      await tx
        .update(industrialTrainingAssignments)
        .set(patch)
        .where(eq(industrialTrainingAssignments.id, assignmentId));

      const replaceAssignees = body.assigneeEmployeeNumbers !== undefined;
      let notifyPersonnelIds: string[] = [];
      if (replaceAssignees) {
        const current = await tx
          .select()
          .from(industrialTrainingAssignmentAssignees)
          .where(
            and(
              eq(industrialTrainingAssignmentAssignees.assignmentId, assignmentId),
              eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
            ),
          );
        if (current.some((row) => row.status === "PASSED")) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Cannot replace assignees after someone has completed this assignment",
          );
        }
        const previousPersonnelIds = new Set(
          current.map((row) => String(row.personnelId ?? "").trim()).filter(Boolean),
        );
        await tx
          .delete(industrialTrainingAssignmentAssignees)
          .where(
            and(
              eq(industrialTrainingAssignmentAssignees.assignmentId, assignmentId),
              eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
            ),
          );
        const assigneeRows = await this.buildAssigneeRows(tx, tenantId, {
          employeeNumbers: body.assigneeEmployeeNumbers ?? [],
          groupIds: [],
        });
        if (!assigneeRows.length) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "At least one assignee with an employee number is required",
          );
        }
        await tx.insert(industrialTrainingAssignmentAssignees).values(
          assigneeRows.map((row) => ({
            id: createId(),
            tenantId,
            assignmentId,
            userId: null,
            personnelId: row.personnelId,
            employeeNumber: row.employeeNumber,
            status: "NOT_STARTED",
            createdAt: now,
            updatedAt: now,
          })),
        );
        notifyPersonnelIds = assigneeRows
          .map((row) => row.personnelId)
          .filter((id): id is string => Boolean(id?.trim()))
          .filter((id) => !previousPersonnelIds.has(id));
      }

      const [row] = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(eq(industrialTrainingAssignments.id, assignmentId));
      const items = await this.hydrateAssignments(tx, tenantId, [row!], principal.userId, true);
      return {
        item: items[0],
        notifyPersonnelIds,
        title: String(row?.title ?? existing.title),
      };
    });

    if (updated.notifyPersonnelIds.length && updated.item?.id) {
      await notifyTrainingAssigned(this.db, this.notifications, principal, {
        assignmentId: updated.item.id,
        title: updated.title,
        personnelIds: updated.notifyPersonnelIds,
      });
    }
    return updated.item;
  }

  async archiveAssignment(principal: ForgePrincipal, assignmentId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingAssignments)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(
          and(
            eq(industrialTrainingAssignments.id, assignmentId),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Assignment not found");
      return { id: row.id, status: row.status };
    });
  }

  async removeAssignmentAssignee(
    principal: ForgePrincipal,
    assignmentId: string,
    assigneeId: string,
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [assignee] = await tx
        .select()
        .from(industrialTrainingAssignmentAssignees)
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.id, assigneeId),
            eq(industrialTrainingAssignmentAssignees.assignmentId, assignmentId),
            eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!assignee) throw new ForgeError("NOT_FOUND", "Assignee not found");

      const assignment = await tx.query.industrialTrainingAssignments.findFirst({
        where: and(
          eq(industrialTrainingAssignments.id, assignmentId),
          eq(industrialTrainingAssignments.tenantId, tenantId),
          isNull(industrialTrainingAssignments.archivedAt),
        ),
      });
      if (!assignment) throw new ForgeError("NOT_FOUND", "Assignment not found");

      if (assignee.status === "PASSED") {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Cannot remove an assignee who has already passed this assignment",
        );
      }

      await tx
        .delete(industrialTrainingAssignmentAssignees)
        .where(eq(industrialTrainingAssignmentAssignees.id, assigneeId));

      return { id: assigneeId, assignmentId, removed: true };
    });
  }

  async getTeamSummary(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const canManage =
      principal.permissions.has("industrial.training.manage") ||
      principal.permissions.has("industrial.admin");
    if (!canManage) throw new ForgeError("FORBIDDEN", "Training manage permission required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const assignments = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
            eq(industrialTrainingAssignments.status, "ACTIVE"),
          ),
        );
      const assignees = assignments.length
        ? await tx
            .select()
            .from(industrialTrainingAssignmentAssignees)
            .where(
              and(
                eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
                inArray(
                  industrialTrainingAssignmentAssignees.assignmentId,
                  assignments.map((a) => a.id),
                ),
              ),
            )
        : [];
      const personnelIds = uniqueStrings(
        assignees.map((a) => a.personnelId).filter((id): id is string => Boolean(id)),
      );
      const personnelLabels = await this.personnelRosterMeta(tx, tenantId, personnelIds);
      const sourceRows = assignments.length
        ? await tx
            .select({ id: industrialTrainingSources.id, title: industrialTrainingSources.title })
            .from(industrialTrainingSources)
            .where(
              inArray(
                industrialTrainingSources.id,
                assignments.map((a) => a.sourceId),
              ),
            )
        : [];
      const sourceTitle = new Map(sourceRows.map((s) => [s.id, s.title]));

      const totals = {
        assignments: assignments.length,
        assignees: assignees.length,
        completed: assignees.filter((a) => a.status === "PASSED").length,
        inProgress: assignees.filter((a) => a.status === "IN_PROGRESS").length,
        notStarted: assignees.filter((a) => a.status === "NOT_STARTED").length,
        overdue: assignees.filter((a) => {
          const assignment = assignments.find((x) => x.id === a.assignmentId);
          return assignment?.dueAt && assignment.dueAt < new Date() && a.status !== "PASSED";
        }).length,
      };

      const roster = assignees.map((a) => {
        const assignment = assignments.find((x) => x.id === a.assignmentId)!;
        const employeeNumber =
          a.employeeNumber?.trim() ||
          personnelLabels.get(a.personnelId ?? "")?.employeeNumber ||
          null;
        const personnelLabel = a.personnelId ? personnelLabels.get(a.personnelId) : null;
        return {
          assigneeId: a.id,
          assignmentId: a.assignmentId,
          assignmentTitle: assignment.title,
          sourceId: assignment.sourceId,
          sourceTitle: sourceTitle.get(assignment.sourceId) ?? "Training",
          userId: null,
          personnelId: a.personnelId,
          employeeNumber,
          userLabel: (
            personnelLabel?.displayName ??
            employeeNumber ??
            "Assignee"
          ).toLocaleUpperCase("en-US"),
          siteId: personnelLabel?.siteId ?? null,
          siteName: personnelLabel?.siteName ?? null,
          groupIds: personnelLabel?.groupIds ?? [],
          groupNames: personnelLabel?.groupNames ?? [],
          status: a.status,
          bestPercent: a.bestPercent,
          dueAt: assignment.dueAt,
          completedAt: a.completedAt,
          updatedAt: a.updatedAt,
        };
      });

      return { totals, roster };
    });
  }

  async markAssigneeInProgress(
    tenantId: string,
    assignmentId: string,
    userId: string,
    attemptId: string,
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await this.findAssigneeForPrincipal(tx, tenantId, assignmentId, userId);
      if (!row || row.status === "PASSED") return;
      await tx
        .update(industrialTrainingAssignmentAssignees)
        .set({
          status: "IN_PROGRESS",
          attemptId,
          updatedAt: new Date(),
        })
        .where(eq(industrialTrainingAssignmentAssignees.id, row.id));
    });
  }

  async syncQuizCompletion(input: {
    tenantId: string;
    userId: string;
    assignmentId: string;
    attemptId: string;
    sourceId: string;
    sourceTitle: string;
    percent: number;
    passingPercent: number;
  }) {
    const passed = input.percent >= input.passingPercent;
    const status = passed ? "PASSED" : "FAILED";
    const now = new Date();

    return withTenantTransaction(this.db, input.tenantId, async (tx) => {
      const assignee = await this.findAssigneeForPrincipal(
        tx,
        input.tenantId,
        input.assignmentId,
        input.userId,
      );
      if (!assignee) return;

      const bestPercent = Math.max(assignee.bestPercent ?? 0, input.percent);
      const nextStatus = assignee.status === "PASSED" ? "PASSED" : passed ? "PASSED" : status;

      await tx
        .update(industrialTrainingAssignmentAssignees)
        .set({
          status: nextStatus,
          attemptId: input.attemptId,
          bestPercent,
          completedAt:
            nextStatus === "PASSED" ? (assignee.completedAt ?? now) : assignee.completedAt,
          updatedAt: now,
        })
        .where(eq(industrialTrainingAssignmentAssignees.id, assignee.id));

      if (!passed) return;

      const employeeNumber =
        assignee.employeeNumber?.trim() ||
        (assignee.personnelId
          ? (
              await tx.query.industrialPersonnel.findFirst({
                where: eq(industrialPersonnel.id, assignee.personnelId),
              })
            )?.employeeNumber?.trim()
          : null) ||
        (await this.resolveEmployeeNumberForUser(tx, input.tenantId, input.userId));
      const person = employeeNumber
        ? await this.findPersonnelByEmployeeNumber(tx, input.tenantId, employeeNumber)
        : null;
      const personnelId = person?.id ?? assignee.personnelId ?? null;
      const snapshot = personnelId
        ? await this.lms.personnelSnapshot(tx, input.tenantId, personnelId)
        : {};
      const [attemptRow] = await tx
        .select({ attemptNumber: industrialTrainingAttempts.attemptNumber })
        .from(industrialTrainingAttempts)
        .where(eq(industrialTrainingAttempts.id, input.attemptId))
        .limit(1);
      const [assignment] = await tx
        .select({
          courseVersionId: industrialTrainingAssignments.courseVersionId,
        })
        .from(industrialTrainingAssignments)
        .where(eq(industrialTrainingAssignments.id, input.assignmentId))
        .limit(1);

      if (employeeNumber) {
        await this.lms.recordCompletion(
          {
            tenantId: input.tenantId,
            assignmentId: input.assignmentId,
            assigneeId: assignee.id,
            personnelId,
            employeeNumber,
            sourceId: input.sourceId,
            versionId: assignment?.courseVersionId ?? null,
            attemptId: input.attemptId,
            attemptNumber: attemptRow?.attemptNumber ?? 1,
            scorePercent: input.percent,
            passingPercent: input.passingPercent,
            passed: true,
            snapshot,
          },
          tx,
        );
      }

      // Unique on (tenant, sourceCollection, sourceDocumentId) — must be per attempt,
      // not per assignment, or the 2nd passer / retake fails the whole quiz finish.
      const sourceDocumentId = input.attemptId;
      const existingRecord = await tx.query.industrialTrainingRecords.findFirst({
        where: and(
          eq(industrialTrainingRecords.tenantId, input.tenantId),
          eq(industrialTrainingRecords.sourceCollection, "industrial_training_assignments"),
          eq(industrialTrainingRecords.sourceDocumentId, sourceDocumentId),
        ),
      });
      if (!existingRecord) {
        await tx.insert(industrialTrainingRecords).values({
          id: createId(),
          tenantId: input.tenantId,
          title: input.sourceTitle,
          courseName: input.sourceTitle,
          status: "ACTIVE",
          completedAt: now,
          personnelId,
          sourceSystem: "FORGE",
          sourceCollection: "industrial_training_assignments",
          sourceDocumentId,
          sourcePayload: {
            attemptId: input.attemptId,
            assignmentId: input.assignmentId,
            attemptNumber: attemptRow?.attemptNumber ?? 1,
            percent: input.percent,
            result: "PASSED",
            sourceId: input.sourceId,
            personnelId,
            employeeNumber,
          },
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  }

  async findAssigneeForQuiz(tenantId: string, assignmentId: string, userId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) =>
      this.findAssigneeForPrincipal(tx, tenantId, assignmentId, userId),
    );
  }

  private async hydrateAssignments(
    tx: DatabaseTransaction,
    tenantId: string,
    rows: Array<typeof industrialTrainingAssignments.$inferSelect>,
    viewerUserId: string,
    includeAssigneeDetails = false,
  ) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const assignees = await tx
      .select()
      .from(industrialTrainingAssignmentAssignees)
      .where(
        and(
          eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
          inArray(industrialTrainingAssignmentAssignees.assignmentId, ids),
        ),
      );
    const sourceIds = rows.map((r) => r.sourceId);
    const sources = await tx
      .select({ id: industrialTrainingSources.id, title: industrialTrainingSources.title })
      .from(industrialTrainingSources)
      .where(inArray(industrialTrainingSources.id, sourceIds));
    const sourceTitle = new Map(sources.map((s: { id: string; title: string }) => [s.id, s.title]));

    const viewerEmployeeNumber = await this.resolveEmployeeNumberForUser(
      tx,
      tenantId,
      viewerUserId,
    );
    const personnelIds = uniqueStrings(
      assignees
        .map((a: { personnelId?: string | null }) => a.personnelId)
        .filter(Boolean) as string[],
    );
    const personnelLabels = includeAssigneeDetails
      ? await this.personnelLabels(tx, tenantId, personnelIds)
      : new Map();

    return rows.map((row) => {
      const mine = assignees.filter((a: { assignmentId: string }) => a.assignmentId === row.id);
      const myRow = viewerEmployeeNumber
        ? mine.find(
            (a: { employeeNumber?: string | null }) =>
              String(a.employeeNumber ?? "")
                .trim()
                .toLowerCase() === viewerEmployeeNumber.toLowerCase(),
          )
        : undefined;
      const done = mine.filter((a: { status: string }) => a.status === "PASSED").length;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        sourceId: row.sourceId,
        sourceTitle: sourceTitle.get(row.sourceId) ?? "Training",
        materialId: row.materialId,
        dueAt: row.dueAt,
        passingPercent: row.passingPercent,
        quizMode: row.quizMode,
        optionCount: row.optionCount,
        feedbackEnabled: row.feedbackEnabled,
        timerSeconds: row.timerSeconds,
        contentDelivery: row.contentDelivery,
        contentPresentedAt: row.contentPresentedAt,
        status: row.status,
        assigneeCount: mine.length,
        completedCount: done,
        hasPublicQr: Boolean(row.publicTokenHash),
        myStatus: myRow?.status ?? null,
        myBestPercent: myRow?.bestPercent ?? null,
        ...(includeAssigneeDetails
          ? {
              assignees: mine.map(
                (a: {
                  personnelId?: string | null;
                  employeeNumber?: string | null;
                  status: string;
                  bestPercent?: number | null;
                }) => {
                  const employeeNumber =
                    a.employeeNumber?.trim() ||
                    (a.personnelId ? personnelLabels.get(a.personnelId)?.employeeNumber : null) ||
                    null;
                  const personnel = a.personnelId ? personnelLabels.get(a.personnelId) : null;
                  return {
                    personnelId: a.personnelId ?? null,
                    userId: null,
                    employeeNumber,
                    label: employeeNumber
                      ? `#${employeeNumber}${personnel ? ` · ${personnel.displayName}` : ""}`
                      : (personnel?.label ?? "Assignee"),
                    status: a.status,
                    bestPercent: a.bestPercent ?? null,
                  };
                },
              ),
            }
          : {}),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  private async personnelRosterMeta(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelIds: string[],
  ) {
    const labels = new Map<
      string,
      {
        label: string;
        employeeNumber: string | null;
        displayName: string;
        siteId: string | null;
        siteName: string | null;
        groupIds: string[];
        groupNames: string[];
      }
    >();
    if (!personnelIds.length) return labels;

    const rows = await tx
      .select({
        id: industrialPersonnel.id,
        displayName: industrialPersonnel.displayName,
        employeeNumber: industrialPersonnel.employeeNumber,
        firstName: industrialPersonnel.firstName,
        lastName: industrialPersonnel.lastName,
        siteId: industrialPersonnel.siteId,
        siteName: industrialSites.name,
      })
      .from(industrialPersonnel)
      .leftJoin(industrialSites, eq(industrialPersonnel.siteId, industrialSites.id))
      .where(
        and(
          eq(industrialPersonnel.tenantId, tenantId),
          inArray(industrialPersonnel.id, personnelIds),
          isNull(industrialPersonnel.archivedAt),
        ),
      );

    const groupRows = await tx
      .select({
        personnelId: industrialTrainingGroupMembers.personnelId,
        groupId: industrialTrainingGroups.id,
        groupName: industrialTrainingGroups.name,
      })
      .from(industrialTrainingGroupMembers)
      .innerJoin(
        industrialTrainingGroups,
        eq(industrialTrainingGroupMembers.groupId, industrialTrainingGroups.id),
      )
      .where(
        and(
          eq(industrialTrainingGroupMembers.tenantId, tenantId),
          inArray(industrialTrainingGroupMembers.personnelId, personnelIds),
          isNull(industrialTrainingGroups.archivedAt),
        ),
      );

    const groupsByPersonnel = new Map<string, { ids: string[]; names: string[] }>();
    for (const row of groupRows) {
      if (!row.personnelId) continue;
      const bucket = groupsByPersonnel.get(row.personnelId) ?? { ids: [], names: [] };
      if (!bucket.ids.includes(row.groupId)) {
        bucket.ids.push(row.groupId);
        bucket.names.push(row.groupName);
      }
      groupsByPersonnel.set(row.personnelId, bucket);
    }

    for (const row of rows) {
      const employeeNumber = row.employeeNumber?.trim() || null;
      const displayName = (
        row.displayName?.trim() ||
        [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
        employeeNumber ||
        row.id
      ).toLocaleUpperCase("en-US");
      const label = employeeNumber ? `#${employeeNumber} · ${displayName}` : displayName;
      const groups = groupsByPersonnel.get(row.id) ?? { ids: [], names: [] };
      labels.set(row.id, {
        label,
        employeeNumber,
        displayName,
        siteId: row.siteId ?? null,
        siteName: row.siteName?.trim() || null,
        groupIds: groups.ids,
        groupNames: groups.names,
      });
    }
    return labels;
  }

  private async personnelLabels(tx: DatabaseTransaction, tenantId: string, personnelIds: string[]) {
    const labels = new Map<
      string,
      { label: string; employeeNumber: string | null; displayName: string }
    >();
    if (!personnelIds.length) return labels;
    const rows = await tx
      .select({
        id: industrialPersonnel.id,
        displayName: industrialPersonnel.displayName,
        employeeNumber: industrialPersonnel.employeeNumber,
        firstName: industrialPersonnel.firstName,
        lastName: industrialPersonnel.lastName,
      })
      .from(industrialPersonnel)
      .where(
        and(
          eq(industrialPersonnel.tenantId, tenantId),
          inArray(industrialPersonnel.id, personnelIds),
          isNull(industrialPersonnel.archivedAt),
        ),
      );
    for (const row of rows) {
      const employeeNumber = row.employeeNumber?.trim() || null;
      const displayName = (
        row.displayName?.trim() ||
        [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
        employeeNumber ||
        row.id
      ).toLocaleUpperCase("en-US");
      const label = employeeNumber ? `#${employeeNumber} · ${displayName}` : displayName;
      labels.set(row.id, { label, employeeNumber, displayName });
    }
    return labels;
  }

  private async resolveEmployeeNumberForUser(
    tx: DatabaseTransaction,
    tenantId: string,
    userId: string,
  ) {
    const person = await tx.query.industrialPersonnel.findFirst({
      where: and(
        eq(industrialPersonnel.tenantId, tenantId),
        eq(industrialPersonnel.userAuthId, userId),
        isNull(industrialPersonnel.archivedAt),
      ),
    });
    const employeeNumber = person?.employeeNumber?.trim();
    return employeeNumber || null;
  }

  private async findPersonnelByEmployeeNumber(
    tx: DatabaseTransaction,
    tenantId: string,
    employeeNumber: string,
  ) {
    return queryPersonnelByEmployeeNumber(tx, tenantId, employeeNumber);
  }

  private async findAssigneeForPrincipal(
    tx: DatabaseTransaction,
    tenantId: string,
    assignmentId: string,
    userId: string,
  ) {
    const employeeNumber = await this.resolveEmployeeNumberForUser(tx, tenantId, userId);
    if (!employeeNumber) return null;
    const rows = await tx
      .select()
      .from(industrialTrainingAssignmentAssignees)
      .where(
        and(
          eq(industrialTrainingAssignmentAssignees.assignmentId, assignmentId),
          eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
          sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${employeeNumber})`,
        ),
      );
    return rows[0] ?? null;
  }

  private async buildAssigneeRows(
    tx: DatabaseTransaction,
    tenantId: string,
    input: { employeeNumbers: string[]; groupIds: string[] },
  ): Promise<AssigneeSeed[]> {
    const uniqueSeeds = new Map<string, AssigneeSeed>();

    const addEmployeeNumber = async (raw: string) => {
      const employeeNumber = raw.trim();
      if (!employeeNumber) return;
      const person = await this.findPersonnelByEmployeeNumber(tx, tenantId, employeeNumber);
      if (!person) {
        throw new ForgeError("VALIDATION_FAILED", `Employee number not found: ${employeeNumber}`);
      }
      if (!person.employeeNumber?.trim()) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          `Personnel record is missing employee number: ${employeeNumber}`,
        );
      }
      const seed: AssigneeSeed = {
        employeeNumber: canonicalEmployeeNumber(person.employeeNumber.trim()),
        personnelId: person.id,
      };
      const personnelKey = seed.personnelId ?? seed.employeeNumber.toLowerCase();
      if (uniqueSeeds.has(personnelKey)) return;
      uniqueSeeds.set(personnelKey, seed);
    };

    for (const raw of uniqueStrings(input.employeeNumbers)) {
      await addEmployeeNumber(raw);
    }

    if (input.groupIds.length) {
      const groupMembers = await tx
        .select()
        .from(industrialTrainingGroupMembers)
        .where(
          and(
            eq(industrialTrainingGroupMembers.tenantId, tenantId),
            inArray(industrialTrainingGroupMembers.groupId, input.groupIds),
          ),
        );
      for (const member of groupMembers) {
        if (member.personnelId) {
          const [person] = await tx
            .select({ employeeNumber: industrialPersonnel.employeeNumber })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.id, member.personnelId),
                eq(industrialPersonnel.tenantId, tenantId),
                isNull(industrialPersonnel.archivedAt),
              ),
            )
            .limit(1);
          if (person?.employeeNumber?.trim()) {
            await addEmployeeNumber(person.employeeNumber.trim());
          }
          continue;
        }
        if (!member.userId) continue;
        const employeeNumber = await this.resolveEmployeeNumberForUser(tx, tenantId, member.userId);
        if (employeeNumber) await addEmployeeNumber(employeeNumber);
      }
    }

    return [...uniqueSeeds.values()];
  }

  private industrialAppBaseUrl(override?: string | null): string {
    const raw =
      (typeof override === "string" && override.trim()) ||
      process.env.FORGE_INDUSTRIAL_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://producersrice.forgeindustrialsafety.com";
    let normalized = raw.trim().replace(/\/+$/, "");
    try {
      const parsed = new URL(normalized);
      normalized = parsed.origin;
    } catch {
      // keep trimmed string when override is not a full URL
    }
    if (!/^https?:\/\//i.test(normalized)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Industrial app URL must start with http:// or https://.",
      );
    }
    return normalized;
  }

  private assignmentPublicUrl(token: string, appBaseUrl?: string | null): string {
    const safeToken = encodeURIComponent(token);
    return `${this.industrialAppBaseUrl(appBaseUrl)}/training/?token=${safeToken}`;
  }

  async issueAssignmentQr(
    principal: ForgePrincipal,
    assignmentId: string,
    body: Record<string, unknown> = {},
  ) {
    const tenantId = this.tenant(principal);
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .update(industrialTrainingAssignments)
        .set({
          publicTokenHash: tokenHash,
          publicTokenIssuedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialTrainingAssignments.id, assignmentId),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
            eq(industrialTrainingAssignments.status, "ACTIVE"),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Assignment not found");
      const url = this.assignmentPublicUrl(
        token,
        typeof body.appBaseUrl === "string" ? body.appBaseUrl : null,
      );
      return { token, url, assignmentId: row.id, title: row.title };
    });
  }

  async revokeAssignmentQr(principal: ForgePrincipal, assignmentId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .update(industrialTrainingAssignments)
        .set({
          publicTokenHash: null,
          publicTokenIssuedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(industrialTrainingAssignments.id, assignmentId),
            eq(industrialTrainingAssignments.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Assignment not found");
      return { id: row.id };
    });
  }

  async assignmentQrImage(
    principal: ForgePrincipal,
    assignmentId: string,
    body: Record<string, unknown> = {},
  ) {
    const tenantId = this.tenant(principal);
    const token = String(body.token ?? "").trim();
    if (!token || token.length < 16) {
      throw new ForgeError("VALIDATION_FAILED", "Provide the assignment QR token from issue.");
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.id, assignmentId),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            eq(industrialTrainingAssignments.publicTokenHash, tokenHash),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Assignment QR token is invalid.");
      const url = this.assignmentPublicUrl(
        token,
        typeof body.appBaseUrl === "string" ? body.appBaseUrl : null,
      );
      const png = await qrCodePngBuffer(url, 320);
      return {
        contentType: "image/png",
        dataBase64: png.toString("base64"),
        url,
      };
    });
  }

  async findAssigneeByEmployeeNumber(
    tenantId: string,
    assignmentId: string,
    employeeNumber: string,
  ) {
    const normalized = employeeNumber.trim();
    if (!normalized) return null;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const person = await this.findPersonnelByEmployeeNumber(tx, tenantId, normalized);
      if (!person) return null;
      const keys = employeeNumberLookupKeys(person.employeeNumber ?? normalized);
      const numberMatch =
        keys.length > 0
          ? or(
              ...keys.map(
                (key) =>
                  sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = ${key}`,
              ),
            )
          : sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${person.employeeNumber!.trim()})`;
      const identityMatch = person.id
        ? or(eq(industrialTrainingAssignmentAssignees.personnelId, person.id), numberMatch)
        : numberMatch;
      const rows = await tx
        .select()
        .from(industrialTrainingAssignmentAssignees)
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.assignmentId, assignmentId),
            eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
            identityMatch,
          ),
        );
      return rows[0] ?? null;
    });
  }

  async markAssigneeInProgressByEmployeeNumber(
    tenantId: string,
    assignmentId: string,
    employeeNumber: string,
    attemptId: string,
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const person = await this.findPersonnelByEmployeeNumber(tx, tenantId, employeeNumber);
      if (!person?.employeeNumber?.trim()) return;
      const rows = await tx
        .select()
        .from(industrialTrainingAssignmentAssignees)
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.assignmentId, assignmentId),
            eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
            sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${person.employeeNumber.trim()})`,
          ),
        );
      const row = rows[0];
      if (!row || row.status === "PASSED") return;
      await tx
        .update(industrialTrainingAssignmentAssignees)
        .set({
          status: "IN_PROGRESS",
          attemptId,
          updatedAt: new Date(),
        })
        .where(eq(industrialTrainingAssignmentAssignees.id, row.id));
    });
  }

  async syncQuizCompletionByEmployeeNumber(input: {
    tenantId: string;
    employeeNumber: string;
    assignmentId: string;
    attemptId: string;
    sourceId: string;
    sourceTitle: string;
    percent: number;
    passingPercent: number;
  }) {
    const passed = input.percent >= input.passingPercent;
    const status = passed ? "PASSED" : "FAILED";
    const now = new Date();

    return withTenantTransaction(this.db, input.tenantId, async (tx) => {
      const person = await this.findPersonnelByEmployeeNumber(
        tx,
        input.tenantId,
        input.employeeNumber,
      );
      if (!person?.employeeNumber?.trim()) return;

      const rows = await tx
        .select()
        .from(industrialTrainingAssignmentAssignees)
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.assignmentId, input.assignmentId),
            eq(industrialTrainingAssignmentAssignees.tenantId, input.tenantId),
            sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${person.employeeNumber.trim()})`,
          ),
        );
      const assignee = rows[0];
      if (!assignee) return;

      const bestPercent = Math.max(assignee.bestPercent ?? 0, input.percent);
      const nextStatus = assignee.status === "PASSED" ? "PASSED" : passed ? "PASSED" : status;

      await tx
        .update(industrialTrainingAssignmentAssignees)
        .set({
          status: nextStatus,
          attemptId: input.attemptId,
          bestPercent,
          completedAt:
            nextStatus === "PASSED" ? (assignee.completedAt ?? now) : assignee.completedAt,
          updatedAt: now,
        })
        .where(eq(industrialTrainingAssignmentAssignees.id, assignee.id));

      if (!passed) return;

      const employeeNumber = person.employeeNumber.trim();
      const snapshot = await this.lms.personnelSnapshot(tx, input.tenantId, person.id);
      const [attemptRow] = await tx
        .select({ attemptNumber: industrialTrainingAttempts.attemptNumber })
        .from(industrialTrainingAttempts)
        .where(eq(industrialTrainingAttempts.id, input.attemptId))
        .limit(1);
      const [assignment] = await tx
        .select({
          courseVersionId: industrialTrainingAssignments.courseVersionId,
        })
        .from(industrialTrainingAssignments)
        .where(eq(industrialTrainingAssignments.id, input.assignmentId))
        .limit(1);

      await this.lms.recordCompletion(
        {
          tenantId: input.tenantId,
          assignmentId: input.assignmentId,
          assigneeId: assignee.id,
          personnelId: person.id,
          employeeNumber,
          sourceId: input.sourceId,
          versionId: assignment?.courseVersionId ?? null,
          attemptId: input.attemptId,
          attemptNumber: attemptRow?.attemptNumber ?? 1,
          scorePercent: input.percent,
          passingPercent: input.passingPercent,
          passed: true,
          snapshot,
        },
        tx,
      );

      const sourceDocumentId = input.attemptId;
      const existingRecord = await tx.query.industrialTrainingRecords.findFirst({
        where: and(
          eq(industrialTrainingRecords.tenantId, input.tenantId),
          eq(industrialTrainingRecords.sourceCollection, "industrial_training_assignments"),
          eq(industrialTrainingRecords.sourceDocumentId, sourceDocumentId),
        ),
      });
      if (!existingRecord) {
        await tx.insert(industrialTrainingRecords).values({
          id: createId(),
          tenantId: input.tenantId,
          title: input.sourceTitle,
          courseName: input.sourceTitle,
          status: "ACTIVE",
          completedAt: now,
          personnelId: person.id,
          sourceSystem: "FORGE",
          sourceCollection: "industrial_training_assignments",
          sourceDocumentId,
          sourcePayload: {
            attemptId: input.attemptId,
            assignmentId: input.assignmentId,
            attemptNumber: attemptRow?.attemptNumber ?? 1,
            percent: input.percent,
            result: "PASSED",
            sourceId: input.sourceId,
            personnelId: person.id,
            employeeNumber,
            via: "public-qr",
          },
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  }

  /**
   * Post paper-quiz scores onto an assignment roster.
   * Ensures assignees exist for the given employee numbers, then updates
   * status / bestPercent and writes training records on pass.
   */
  async applyPaperResults(
    principal: ForgePrincipal,
    assignmentId: string,
    body: {
      results?: Array<{
        employeeNumber?: string;
        percent?: number;
        completedAt?: string | null;
      }>;
    },
  ) {
    const tenantId = this.tenant(principal);
    const results = Array.isArray(body.results) ? body.results : [];
    if (!results.length) {
      throw new ForgeError("VALIDATION_FAILED", "At least one paper quiz result is required.");
    }

    const normalized = results.map((row, index) => {
      const employeeNumber = String(row.employeeNumber ?? "").trim();
      const percent = Math.round(Number(row.percent));
      if (!employeeNumber) {
        throw new ForgeError("VALIDATION_FAILED", `Result ${index + 1} is missing employeeNumber.`);
      }
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          `Result for ${employeeNumber} needs a percent between 0 and 100.`,
        );
      }
      const completedAt = row.completedAt ? new Date(String(row.completedAt)) : new Date();
      if (Number.isNaN(completedAt.getTime())) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          `Result for ${employeeNumber} has an invalid completedAt.`,
        );
      }
      return { employeeNumber, percent, completedAt };
    });

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.id, assignmentId),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .limit(1);
      if (!assignment) throw new ForgeError("NOT_FOUND", "Assignment not found");

      const source = await tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, assignment.sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
        ),
      });
      if (!source) throw new ForgeError("NOT_FOUND", "Course not found for assignment");

      const seeds = await this.buildAssigneeRows(tx, tenantId, {
        employeeNumbers: normalized.map((row) => row.employeeNumber),
        groupIds: [],
      });
      const seedByNumber = indexByEmployeeNumberAliases(
        seeds.map((seed) => ({ employeeNumber: seed.employeeNumber, value: seed })),
      );

      const existingAssignees = await tx
        .select()
        .from(industrialTrainingAssignmentAssignees)
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.assignmentId, assignmentId),
            eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
          ),
        );
      const assigneeByNumber = indexByEmployeeNumberAliases(
        existingAssignees
          .filter((row) => row.employeeNumber?.trim())
          .map((row) => ({ employeeNumber: row.employeeNumber!.trim(), value: row })),
      );

      const now = new Date();
      const posted = [];
      for (const result of normalized) {
        const seed = seedByNumber.get(result.employeeNumber.toLowerCase());
        if (!seed) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            `Employee number not found: ${result.employeeNumber}`,
          );
        }

        let assignee =
          assigneeByNumber.get(result.employeeNumber.toLowerCase()) ??
          assigneeByNumber.get(seed.employeeNumber.toLowerCase());
        if (!assignee) {
          const id = createId();
          await tx.insert(industrialTrainingAssignmentAssignees).values({
            id,
            tenantId,
            assignmentId,
            userId: null,
            personnelId: seed.personnelId,
            employeeNumber: seed.employeeNumber,
            status: "NOT_STARTED",
            attemptId: null,
            bestPercent: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const [created] = await tx
            .select()
            .from(industrialTrainingAssignmentAssignees)
            .where(eq(industrialTrainingAssignmentAssignees.id, id))
            .limit(1);
          assignee = created;
          if (assignee) {
            for (const alias of employeeNumberLookupKeys(seed.employeeNumber)) {
              assigneeByNumber.set(alias, assignee);
            }
          }
        }
        if (!assignee) continue;

        const passed = result.percent >= assignment.passingPercent;
        const status = passed ? "PASSED" : "FAILED";
        const bestPercent = Math.max(assignee.bestPercent ?? 0, result.percent);
        const nextStatus = assignee.status === "PASSED" ? "PASSED" : status;
        const completedAt =
          nextStatus === "PASSED"
            ? (assignee.completedAt ?? result.completedAt)
            : assignee.completedAt;

        await tx
          .update(industrialTrainingAssignmentAssignees)
          .set({
            status: nextStatus,
            bestPercent,
            completedAt,
            updatedAt: now,
          })
          .where(eq(industrialTrainingAssignmentAssignees.id, assignee.id));

        if (passed) {
          const snapshot = seed.personnelId
            ? await this.lms.personnelSnapshot(tx, tenantId, seed.personnelId)
            : { employeeNumber: seed.employeeNumber };
          await this.lms.recordCompletion(
            {
              tenantId,
              assignmentId,
              assigneeId: assignee.id,
              personnelId: seed.personnelId,
              employeeNumber: seed.employeeNumber,
              sourceId: assignment.sourceId,
              versionId: assignment.courseVersionId ?? null,
              attemptId: null,
              attemptNumber: 1,
              scorePercent: result.percent,
              passingPercent: assignment.passingPercent,
              passed: true,
              snapshot: { ...snapshot, delivery: "PAPER" },
            },
            tx,
          );

          const paperDocId = `${assignmentId}:${seed.employeeNumber.trim().toLowerCase()}`;
          const existingPaper = await tx.query.industrialTrainingRecords.findFirst({
            where: and(
              eq(industrialTrainingRecords.tenantId, tenantId),
              eq(industrialTrainingRecords.sourceCollection, "industrial_training_paper_quiz"),
              eq(industrialTrainingRecords.sourceDocumentId, paperDocId),
            ),
          });
          if (!existingPaper) {
            await tx.insert(industrialTrainingRecords).values({
              id: createId(),
              tenantId,
              title: source.title,
              courseName: source.title,
              status: "ACTIVE",
              completedAt: result.completedAt,
              personnelId: seed.personnelId,
              sourceSystem: "FORGE",
              sourceCollection: "industrial_training_paper_quiz",
              sourceDocumentId: paperDocId,
              sourcePayload: {
                percent: result.percent,
                result: "PASSED",
                attemptNumber: 1,
                sourceId: assignment.sourceId,
                personnelId: seed.personnelId,
                employeeNumber: seed.employeeNumber,
                via: "paper-quiz",
                assignmentId,
              },
              createdAt: now,
              updatedAt: now,
            });
          }
        }

        posted.push({
          employeeNumber: seed.employeeNumber,
          percent: result.percent,
          status: nextStatus,
          passed: nextStatus === "PASSED",
        });
      }

      return {
        assignmentId,
        sourceId: assignment.sourceId,
        sourceTitle: source.title,
        passingPercent: assignment.passingPercent,
        posted,
      };
    });
  }

  /**
   * Select a course, then post paper-quiz scores for bulk-selected trainees.
   * Reuses an existing active paper-quiz assignment for the course when present,
   * otherwise creates one and applies the results.
   */
  async applyPaperResultsForSource(
    principal: ForgePrincipal,
    sourceId: string,
    body: {
      assignmentId?: string;
      passingPercent?: number;
      results?: Array<{
        employeeNumber?: string;
        percent?: number;
        completedAt?: string | null;
      }>;
    },
  ) {
    const tenantId = this.tenant(principal);
    const results = Array.isArray(body.results) ? body.results : [];
    if (!results.length) {
      throw new ForgeError("VALIDATION_FAILED", "At least one paper quiz result is required.");
    }

    const explicitAssignmentId = String(body.assignmentId ?? "").trim();
    if (explicitAssignmentId) {
      const assignment = await withTenantTransaction(this.db, tenantId, async (tx) => {
        const [row] = await tx
          .select()
          .from(industrialTrainingAssignments)
          .where(
            and(
              eq(industrialTrainingAssignments.id, explicitAssignmentId),
              eq(industrialTrainingAssignments.tenantId, tenantId),
              isNull(industrialTrainingAssignments.archivedAt),
            ),
          )
          .limit(1);
        return row ?? null;
      });
      if (!assignment) throw new ForgeError("NOT_FOUND", "Assignment not found");
      if (assignment.sourceId !== sourceId) {
        throw new ForgeError("VALIDATION_FAILED", "Assignment does not belong to this course.");
      }
      return this.applyPaperResults(principal, explicitAssignmentId, { results });
    }

    const source = await withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
          isNull(industrialTrainingSources.archivedAt),
        ),
      });
    });
    if (!source) throw new ForgeError("NOT_FOUND", "Course not found");
    if (source.status !== "PUBLISHED") {
      throw new ForgeError("VALIDATION_FAILED", "Source must be published");
    }

    const paperMarker = "[paper-quiz]";
    const existingPaper = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.tenantId, tenantId),
            eq(industrialTrainingAssignments.sourceId, sourceId),
            eq(industrialTrainingAssignments.status, "ACTIVE"),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .orderBy(desc(industrialTrainingAssignments.updatedAt));
      return (
        rows.find((row) => (row.description ?? "").includes(paperMarker)) ??
        rows.find((row) => row.title.toLowerCase().startsWith("paper quiz:")) ??
        null
      );
    });

    if (existingPaper) {
      return this.applyPaperResults(principal, existingPaper.id, { results });
    }

    const employeeNumbers = [
      ...new Set(results.map((row) => String(row.employeeNumber ?? "").trim()).filter(Boolean)),
    ];
    const created = await this.createAssignment(principal, {
      title: `Paper quiz: ${source.title}`,
      description: `${paperMarker} Scores entered from a printed paper quiz.`,
      sourceId,
      assigneeEmployeeNumbers: employeeNumbers,
      ...(body.passingPercent != null ? { passingPercent: body.passingPercent } : {}),
    });
    if (!created || typeof created.id !== "string" || !created.id) {
      throw new ForgeError("VALIDATION_FAILED", "Failed to create paper quiz assignment");
    }

    return this.applyPaperResults(principal, created.id, { results });
  }
}
