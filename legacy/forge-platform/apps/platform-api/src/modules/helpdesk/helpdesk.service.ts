import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  HELPDESK_INDUSTRIAL_PRODUCT_AREAS,
  HELPDESK_MAX_ATTACHMENT_BYTES,
  HELPDESK_OPEN_STATUSES,
  HELPDESK_PRIORITY_META,
  HELPDESK_REQUEST_TYPES,
  HELPDESK_STATUS_LABELS,
  allowedHelpdeskTransitions,
  canTransitionHelpdeskStatus,
  documentBelongsToTenant,
  formatHelpdeskTicketNumber,
  isAllowedHelpdeskAttachmentMime,
  isHelpdeskStatus,
  objectKeyBelongsToTenant,
  type HelpdeskTicketStatus,
} from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  persons,
  supportCategories,
  supportTags,
  supportTicketAttachments,
  supportTicketEvents,
  supportTicketMessages,
  supportTicketTags,
  supportTicketWatchers,
  supportTickets,
  tenants,
  users,
  type Database,
  type DatabaseTransaction,
  withBypassRlsTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  HELPDESK_ATTACHMENT_SOURCE,
  assignSchema,
  attachmentUploadSchema,
  buildCustomerTicketView,
  createTicketSchema,
  customerStatusSchema,
  helpdeskAttachmentPrefix,
  messageSchema,
  parsePaging,
  parseQueue,
  priorityChangeSchema,
  sanitizeTechnicalContext,
  slugifyTag,
  statusChangeSchema,
  supportReplySchema,
  tagChangeSchema,
  toAttachment,
  toCustomerTicket,
  toEvent,
  toMessage,
  toSupportTicket,
  watcherChangeSchema,
  type AttachmentRow,
  type EventRow,
  type MessageRow,
  type TicketRow,
} from "./helpdesk.rules.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ActorType = "CUSTOMER" | "SUPPORT" | "SYSTEM";
type Actor = { userId: string; name: string; email: string | null; type: ActorType };
type Mode = "customer" | "support";

type UserDisplay = { userId: string; tenantId: string; name: string; email: string | null };

function displayName(row: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const full = [row.firstName, row.lastName]
    .filter((p) => p && p.trim())
    .join(" ")
    .trim();
  return (
    row.displayName?.trim() ||
    full ||
    row.username?.trim() ||
    row.email?.trim() ||
    "User"
  ).slice(0, 200);
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function assertUuid(value: string, label: string): string {
  const id = String(value ?? "").trim();
  if (!UUID.test(id)) throw new ForgeError("VALIDATION_FAILED", `${label} must be a UUID`);
  return id;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

@Injectable()
export class HelpdeskService {
  private readonly logger = new Logger(HelpdeskService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentStorageService) private readonly storage: DocumentStorageService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- access helpers

  private has(principal: ForgePrincipal, code: string): boolean {
    return principal.isPlatformAdmin || principal.permissions.has(code);
  }

  private require(principal: ForgePrincipal, code: string, message: string): void {
    if (!this.has(principal, code)) throw new ForgeError("FORBIDDEN", message);
  }

  private tenantOf(principal: ForgePrincipal): string {
    if (!principal.tenantId) throw new ForgeError("FORBIDDEN", "Tenant context required");
    return principal.tenantId;
  }

  isSupportAgent(principal: ForgePrincipal): boolean {
    return this.has(principal, "helpdesk.support.view");
  }

  /** Only Forge platform staff see tickets across every customer tenant. */
  private crossTenant(principal: ForgePrincipal): boolean {
    return principal.isPlatformAdmin;
  }

  private canViewTenantTickets(principal: ForgePrincipal): boolean {
    return this.has(principal, "helpdesk.ticket.view_tenant");
  }

  private async loadUsers(userIds: string[]): Promise<Map<string, UserDisplay>> {
    const unique = [...new Set(userIds.filter((id) => UUID.test(id)))];
    if (unique.length === 0) return new Map();
    const rows = await withBypassRlsTransaction(this.db, (tx) =>
      tx
        .select({
          userId: users.id,
          tenantId: users.tenantId,
          email: users.primaryEmail,
          username: users.username,
          displayName: persons.displayName,
          firstName: persons.firstName,
          lastName: persons.lastName,
        })
        .from(users)
        .leftJoin(persons, eq(persons.id, users.personId))
        .where(inArray(users.id, unique)),
    );
    return new Map(
      rows.map((r) => [
        r.userId,
        { userId: r.userId, tenantId: r.tenantId, name: displayName(r), email: r.email ?? null },
      ]),
    );
  }

  private async actorFor(principal: ForgePrincipal, type: ActorType): Promise<Actor> {
    const map = await this.loadUsers([principal.userId]);
    const user = map.get(principal.userId);
    return {
      userId: principal.userId,
      name: user?.name ?? "User",
      email: user?.email ?? null,
      type,
    };
  }

  private async tenantNames(tenantIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(tenantIds)];
    if (unique.length === 0) return new Map();
    const rows = await withBypassRlsTransaction(this.db, (tx) =>
      tx
        .select({ id: tenants.id, name: tenants.displayName })
        .from(tenants)
        .where(inArray(tenants.id, unique)),
    );
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async writeAudit(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    tenantId: string,
    action: string,
    ticketId: string,
    detail: {
      before?: unknown;
      after?: unknown;
      metadata?: Record<string, unknown>;
      risk?: "LOW" | "MEDIUM";
    } = {},
  ) {
    await this.audit.writeInTransaction(tx, {
      tenantId,
      actorUserId: principal.userId,
      actorPersonId: principal.personId,
      actorType: "USER",
      action,
      resourceType: "support_ticket",
      resourceId: ticketId,
      result: "SUCCESS",
      riskLevel: detail.risk ?? "LOW",
      correlationId: principal.correlationId,
      requestId: principal.requestId,
      ...(detail.before !== undefined ? { before: detail.before } : {}),
      ...(detail.after !== undefined ? { after: detail.after } : {}),
      metadata: { ...(detail.metadata ?? {}), platformSupport: principal.isPlatformAdmin },
    });
  }

  private async addEvent(
    tx: DatabaseTransaction,
    ticket: { id: string; tenantId: string },
    actor: Actor,
    eventType: string,
    values: {
      from?: string | null;
      to?: string | null;
      internal?: boolean;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    await tx.insert(supportTicketEvents).values({
      id: createId(),
      tenantId: ticket.tenantId,
      ticketId: ticket.id,
      eventType,
      fromValue: values.from ?? null,
      toValue: values.to ?? null,
      isInternal: values.internal ?? false,
      actorUserId: actor.type === "SYSTEM" ? null : actor.userId,
      actorName: actor.name,
      actorType: actor.type,
      metadata: values.metadata ?? {},
    });
  }

  private async findTicket(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<TicketRow | null> {
    const [row] = await tx
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.id, id),
          eq(supportTickets.tenantId, tenantId),
          isNull(supportTickets.deletedAt),
        ),
      )
      .limit(1);
    return (row as TicketRow | undefined) ?? null;
  }

  private async updateTicket(
    tx: DatabaseTransaction,
    ticket: TicketRow,
    patch: Partial<typeof supportTickets.$inferInsert>,
    expectedVersion?: number,
  ): Promise<TicketRow> {
    if (expectedVersion !== undefined && expectedVersion !== ticket.recordVersion) {
      throw new ForgeError(
        "CONFLICT",
        "This ticket was updated by someone else. Refresh and try again.",
      );
    }
    const [row] = await tx
      .update(supportTickets)
      .set({ ...patch, updatedAt: new Date(), recordVersion: ticket.recordVersion + 1 })
      .where(
        and(
          eq(supportTickets.id, ticket.id),
          eq(supportTickets.recordVersion, ticket.recordVersion),
        ),
      )
      .returning();
    if (!row)
      throw new ForgeError(
        "CONFLICT",
        "This ticket was updated by someone else. Refresh and try again.",
      );
    return row as TicketRow;
  }

  /** Customer access: same tenant, and own ticket unless the user may view all company tickets. */
  private async customerTicket(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    id: string,
  ): Promise<TicketRow> {
    const ticket = await this.findTicket(tx, this.tenantOf(principal), id);
    if (!ticket) throw new ForgeError("NOT_FOUND", "Ticket not found");
    if (ticket.requesterUserId !== principal.userId && !this.canViewTenantTickets(principal)) {
      throw new ForgeError("NOT_FOUND", "Ticket not found");
    }
    return ticket;
  }

  /** Resolve which tenant a ticket lives in, honoring the support scope. */
  private async supportTicketTenant(principal: ForgePrincipal, id: string): Promise<string> {
    if (!this.isSupportAgent(principal))
      throw new ForgeError("FORBIDDEN", "Support access required");
    const ticketId = assertUuid(id, "ticketId");
    const run = async (tx: DatabaseTransaction) => {
      const conditions = [eq(supportTickets.id, ticketId), isNull(supportTickets.deletedAt)];
      if (!this.crossTenant(principal))
        conditions.push(eq(supportTickets.tenantId, this.tenantOf(principal)));
      const [row] = await tx
        .select({ tenantId: supportTickets.tenantId })
        .from(supportTickets)
        .where(and(...conditions))
        .limit(1);
      return row?.tenantId ?? null;
    };
    const tenantId = this.crossTenant(principal)
      ? await withBypassRlsTransaction(this.db, run, principal.userId)
      : await withTenantTransaction(this.db, this.tenantOf(principal), run, principal.userId);
    if (!tenantId) throw new ForgeError("NOT_FOUND", "Ticket not found");
    return tenantId;
  }

  private async withSupportTicket<T>(
    principal: ForgePrincipal,
    id: string,
    fn: (tx: DatabaseTransaction, ticket: TicketRow) => Promise<T>,
  ): Promise<T> {
    const tenantId = await this.supportTicketTenant(principal, id);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const ticket = await this.findTicket(tx, tenantId, id);
        if (!ticket) throw new ForgeError("NOT_FOUND", "Ticket not found");
        return fn(tx, ticket);
      },
      principal.userId,
    );
  }

  private async notify(
    principal: ForgePrincipal,
    userId: string | null,
    message: {
      type: string;
      title: string;
      body: string;
      href: string;
      priority?: "NORMAL" | "HIGH";
    },
  ) {
    if (!userId || userId === principal.userId) return;
    try {
      const user = (await this.loadUsers([userId])).get(userId);
      if (!user) return;
      await this.notifications.create(
        user.tenantId,
        {
          userId,
          type: message.type,
          title: message.title.slice(0, 200),
          body: message.body.slice(0, 2000),
          priority: message.priority ?? "NORMAL",
          destination: "IN_APP",
          href: message.href,
        },
        principal,
      );
    } catch (err) {
      this.logger.warn(`helpdesk notification failed: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- configuration

  async getConfig(principal: ForgePrincipal) {
    const tenantId = this.tenantOf(principal);
    const rows = await withTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(supportCategories)
        .where(eq(supportCategories.active, true))
        .orderBy(asc(supportCategories.sortOrder), asc(supportCategories.label)),
    );
    const requestTypes = rows
      .filter((r) => r.kind === "REQUEST_TYPE")
      .map((r) => ({ code: r.code, label: r.label }));
    const productAreas = rows
      .filter((r) => r.kind === "PRODUCT_AREA")
      .map((r) => ({ code: r.code, label: r.label, productCode: r.productCode }));
    return {
      requestTypes: requestTypes.length
        ? requestTypes
        : HELPDESK_REQUEST_TYPES.map((r) => ({ ...r })),
      productAreas: productAreas.length
        ? productAreas
        : HELPDESK_INDUSTRIAL_PRODUCT_AREAS.map((r) => ({ ...r, productCode: "FORGE_INDUSTRIAL" })),
      capabilities: {
        canCreate: this.has(principal, "helpdesk.ticket.create"),
        canViewTenant: this.canViewTenantTickets(principal),
        canComment: this.has(principal, "helpdesk.ticket.comment"),
        canReopen: this.has(principal, "helpdesk.ticket.reopen"),
        canClose: this.has(principal, "helpdesk.ticket.close"),
        isSupportAgent: this.isSupportAgent(principal),
        crossTenant: this.crossTenant(principal),
        canAssign: this.has(principal, "helpdesk.support.assign"),
        canRespond: this.has(principal, "helpdesk.support.respond"),
        canInternalNote: this.has(principal, "helpdesk.support.internal_note"),
        canChangeStatus: this.has(principal, "helpdesk.support.change_status"),
        canChangePriority: this.has(principal, "helpdesk.support.change_priority"),
        canManageWatchers: this.has(principal, "helpdesk.support.manage_watchers"),
      },
    };
  }

  // ---------------------------------------------------------------- customer: tickets

  private async claimTicketNumber(tx: DatabaseTransaction, now: Date): Promise<string> {
    const year = now.getUTCFullYear();
    const result = await tx.execute(sql`
      insert into support_ticket_sequences (year, last_value, updated_at)
      values (${year}, 1, now())
      on conflict (year) do update
        set last_value = support_ticket_sequences.last_value + 1, updated_at = now()
      returning last_value
    `);
    const value = Number(rowsOf<{ last_value: number | string }>(result)[0]?.last_value ?? 0);
    if (!value) throw new ForgeError("INTERNAL_ERROR", "Could not allocate a ticket number");
    return formatHelpdeskTicketNumber(year, value);
  }

  async createTicket(principal: ForgePrincipal, body: unknown) {
    this.require(
      principal,
      "helpdesk.ticket.create",
      "You do not have permission to submit support tickets",
    );
    const tenantId = this.tenantOf(principal);
    const input = createTicketSchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "CUSTOMER");
    const clientRequestId = input.clientRequestId?.trim() || null;

    const existing = async () => {
      if (!clientRequestId) return null;
      return withTenantTransaction(this.db, tenantId, async (tx) => {
        const [row] = await tx
          .select()
          .from(supportTickets)
          .where(
            and(
              eq(supportTickets.tenantId, tenantId),
              eq(supportTickets.requesterUserId, principal.userId),
              eq(supportTickets.clientRequestId, clientRequestId),
            ),
          )
          .limit(1);
        return (row as TicketRow | undefined) ?? null;
      });
    };

    const prior = await existing();
    if (prior) return { ticket: toCustomerTicket(prior), duplicate: true };

    const technicalContext = {
      ...sanitizeTechnicalContext(input.technicalContext),
      tenantId,
      userId: principal.userId,
      productCode: input.productCode,
      moduleCode: input.moduleCode ?? null,
      authProvider: principal.authProvider,
      serverReceivedAt: new Date().toISOString(),
      requestId: principal.requestId,
      correlationId: principal.correlationId,
    };

    try {
      const ticket = await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const now = new Date();
          const ticketNumber = await this.claimTicketNumber(tx, now);
          const [row] = await tx
            .insert(supportTickets)
            .values({
              id: createId(),
              tenantId,
              productCode: input.productCode,
              moduleCode: input.moduleCode ?? null,
              ticketNumber,
              requesterUserId: principal.userId,
              requesterName: actor.name,
              requesterEmail: input.requesterEmail ?? actor.email,
              requestType: input.requestType,
              productArea: input.productArea ?? null,
              subject: input.subject,
              description: input.description,
              customerReportedSeverity: input.customerReportedSeverity ?? null,
              priority: input.customerReportedSeverity ?? "P3_NORMAL",
              status: "NEW",
              source: input.source,
              locationId: input.locationId ?? null,
              divisionId: input.divisionId ?? null,
              relatedEntityType: input.relatedEntityType ?? null,
              relatedEntityId: input.relatedEntityId ?? null,
              technicalContext,
              askForgeContext: input.askForgeContext ?? null,
              clientRequestId,
              lastCustomerActivityAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          const created = row as TicketRow;
          await this.addEvent(tx, created, actor, "CREATED", { to: "NEW" });
          await this.writeAudit(tx, principal, tenantId, "helpdesk.ticket.created", created.id, {
            after: {
              ticketNumber,
              subject: created.subject,
              requestType: created.requestType,
              priority: created.priority,
              productCode: created.productCode,
            },
          });
          return created;
        },
        principal.userId,
      );
      return { ticket: toCustomerTicket(ticket), duplicate: false };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const again = await existing();
        if (again) return { ticket: toCustomerTicket(again), duplicate: true };
      }
      throw err;
    }
  }

  async listMyTickets(principal: ForgePrincipal, query: Record<string, unknown>) {
    const tenantId = this.tenantOf(principal);
    const scope =
      String(query.scope ?? "mine") === "company" && this.canViewTenantTickets(principal)
        ? "company"
        : "mine";
    if (scope === "mine") {
      this.require(
        principal,
        "helpdesk.ticket.view_own",
        "You do not have permission to view support tickets",
      );
    }
    const { page, pageSize, offset } = parsePaging(query, 100);
    const status = String(query.status ?? "").trim();
    const q = String(query.q ?? "").trim();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conditions: SQL[] = [
        eq(supportTickets.tenantId, tenantId),
        isNull(supportTickets.deletedAt),
      ];
      if (scope === "mine") conditions.push(eq(supportTickets.requesterUserId, principal.userId));
      if (status === "open")
        conditions.push(inArray(supportTickets.status, [...HELPDESK_OPEN_STATUSES]));
      else if (status === "closed")
        conditions.push(inArray(supportTickets.status, ["RESOLVED", "CLOSED"]));
      else if (isHelpdeskStatus(status)) conditions.push(eq(supportTickets.status, status));
      if (q) conditions.push(this.searchCondition(q));
      const where = and(...conditions);
      const total = await this.countTickets(tx, where);
      const rows = (await tx
        .select()
        .from(supportTickets)
        .where(where)
        .orderBy(desc(supportTickets.updatedAt))
        .limit(pageSize)
        .offset(offset)) as TicketRow[];
      return { items: rows.map(toCustomerTicket), page, pageSize, total, scope };
    });
  }

  async getMyTicket(principal: ForgePrincipal, id: string) {
    const ticketId = assertUuid(id, "ticketId");
    return withTenantTransaction(
      this.db,
      this.tenantOf(principal),
      async (tx) => {
        const ticket = await this.customerTicket(tx, principal, ticketId);
        const [messages, attachments, events] = await this.loadThread(tx, ticket.id);
        const view = buildCustomerTicketView({ ticket, messages, attachments, events });
        return {
          ...view,
          canReply: this.has(principal, "helpdesk.ticket.comment") && ticket.status !== "CLOSED",
          canReopen:
            this.has(principal, "helpdesk.ticket.reopen") &&
            canTransitionHelpdeskStatus(
              ticket.status as HelpdeskTicketStatus,
              "REOPENED",
              "CUSTOMER",
            ),
          canClose:
            this.has(principal, "helpdesk.ticket.close") &&
            canTransitionHelpdeskStatus(
              ticket.status as HelpdeskTicketStatus,
              "CLOSED",
              "CUSTOMER",
            ),
        };
      },
      principal.userId,
    );
  }

  private async countTickets(tx: DatabaseTransaction, where: SQL | undefined): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(where);
    return Number(row?.total ?? 0);
  }

  private async loadThread(
    tx: DatabaseTransaction,
    ticketId: string,
  ): Promise<[MessageRow[], AttachmentRow[], EventRow[]]> {
    const messages = (await tx
      .select()
      .from(supportTicketMessages)
      .where(
        and(eq(supportTicketMessages.ticketId, ticketId), isNull(supportTicketMessages.deletedAt)),
      )
      .orderBy(asc(supportTicketMessages.createdAt))) as MessageRow[];
    const attachments = (await tx
      .select()
      .from(supportTicketAttachments)
      .where(
        and(
          eq(supportTicketAttachments.ticketId, ticketId),
          isNull(supportTicketAttachments.deletedAt),
        ),
      )
      .orderBy(asc(supportTicketAttachments.createdAt))) as AttachmentRow[];
    const events = (await tx
      .select()
      .from(supportTicketEvents)
      .where(eq(supportTicketEvents.ticketId, ticketId))
      .orderBy(asc(supportTicketEvents.createdAt))) as EventRow[];
    return [messages, attachments, events];
  }

  async customerReply(principal: ForgePrincipal, id: string, body: unknown) {
    this.require(
      principal,
      "helpdesk.ticket.comment",
      "You do not have permission to reply on support tickets",
    );
    const ticketId = assertUuid(id, "ticketId");
    const input = messageSchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "CUSTOMER");
    const result = await withTenantTransaction(
      this.db,
      this.tenantOf(principal),
      async (tx) => {
        let ticket = await this.customerTicket(tx, principal, ticketId);
        const from = ticket.status as HelpdeskTicketStatus;
        if (from === "CLOSED") {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "This ticket is closed. Reopen it to continue the conversation.",
          );
        }
        let next: HelpdeskTicketStatus | null = null;
        if (from === "RESOLVED") {
          if (!this.has(principal, "helpdesk.ticket.reopen")) {
            throw new ForgeError("FORBIDDEN", "This ticket is resolved and you cannot reopen it");
          }
          next = "REOPENED";
        } else if (from === "WAITING_ON_CUSTOMER") {
          next = ticket.assignedUserId ? "IN_PROGRESS" : "TRIAGE";
        }
        const now = new Date();
        const messageId = createId();
        await tx.insert(supportTicketMessages).values({
          id: messageId,
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          authorUserId: principal.userId,
          authorName: actor.name,
          authorType: "CUSTOMER",
          messageType: "CUSTOMER_MESSAGE",
          body: input.body,
          isInternal: false,
        });
        ticket = await this.updateTicket(tx, ticket, {
          lastCustomerActivityAt: now,
          ...(next ? { status: next } : {}),
          ...(next === "REOPENED" ? { reopenedAt: now, resolvedAt: null } : {}),
        });
        if (next)
          await this.addEvent(
            tx,
            ticket,
            actor,
            next === "REOPENED" ? "REOPENED" : "STATUS_CHANGED",
            { from, to: next },
          );
        await this.writeAudit(
          tx,
          principal,
          ticket.tenantId,
          "helpdesk.message.created",
          ticket.id,
          {
            metadata: { messageId, messageType: "CUSTOMER_MESSAGE", statusChangedTo: next },
          },
        );
        return { ticket, messageId };
      },
      principal.userId,
    );
    await this.notify(principal, result.ticket.assignedUserId, {
      type: "helpdesk.customer_reply",
      title: `Customer replied on ${result.ticket.ticketNumber}`,
      body: `${actor.name}: ${input.body.slice(0, 280)}`,
      href: `/help-desk/support/?ticket=${result.ticket.id}`,
    });
    return { ticket: toCustomerTicket(result.ticket), messageId: result.messageId };
  }

  async customerSetStatus(
    principal: ForgePrincipal,
    id: string,
    target: "REOPENED" | "CLOSED",
    body: unknown,
  ) {
    this.require(
      principal,
      target === "REOPENED" ? "helpdesk.ticket.reopen" : "helpdesk.ticket.close",
      target === "REOPENED"
        ? "You cannot reopen support tickets"
        : "You cannot close support tickets",
    );
    const ticketId = assertUuid(id, "ticketId");
    const input = customerStatusSchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "CUSTOMER");
    const ticket = await withTenantTransaction(
      this.db,
      this.tenantOf(principal),
      async (tx) => {
        const current = await this.customerTicket(tx, principal, ticketId);
        const from = current.status as HelpdeskTicketStatus;
        if (!canTransitionHelpdeskStatus(from, target, "CUSTOMER")) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            `A ${HELPDESK_STATUS_LABELS[from].toLowerCase()} ticket cannot be ${target === "REOPENED" ? "reopened" : "closed"}`,
          );
        }
        const now = new Date();
        if (input.reason) {
          await tx.insert(supportTicketMessages).values({
            id: createId(),
            tenantId: current.tenantId,
            ticketId: current.id,
            authorUserId: principal.userId,
            authorName: actor.name,
            authorType: "CUSTOMER",
            messageType: "CUSTOMER_MESSAGE",
            body: input.reason,
            isInternal: false,
          });
        }
        const updated = await this.updateTicket(tx, current, {
          status: target,
          lastCustomerActivityAt: now,
          ...(target === "REOPENED"
            ? { reopenedAt: now, resolvedAt: null, closedAt: null }
            : { closedAt: now }),
        });
        await this.addEvent(tx, updated, actor, target === "REOPENED" ? "REOPENED" : "CLOSED", {
          from,
          to: target,
        });
        await this.writeAudit(
          tx,
          principal,
          updated.tenantId,
          target === "REOPENED" ? "helpdesk.ticket.reopened" : "helpdesk.ticket.closed",
          updated.id,
          { before: { status: from }, after: { status: target } },
        );
        return updated;
      },
      principal.userId,
    );
    if (target === "REOPENED") {
      await this.notify(principal, ticket.assignedUserId, {
        type: "helpdesk.ticket_reopened",
        title: `${ticket.ticketNumber} was reopened`,
        body: ticket.subject,
        href: `/help-desk/support/?ticket=${ticket.id}`,
      });
    }
    return { ticket: toCustomerTicket(ticket) };
  }

  // ---------------------------------------------------------------- support console

  /** Support search also matches customer name and internal tags; customer search never does. */
  private searchCondition(q: string, support = false): SQL {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const parts: SQL[] = [
      sql`${supportTickets.ticketNumber} ilike ${like}`,
      sql`${supportTickets.subject} ilike ${like}`,
      sql`${supportTickets.requesterName} ilike ${like}`,
      sql`${supportTickets.requesterEmail} ilike ${like}`,
      sql`to_tsvector('simple', coalesce(${supportTickets.subject}, '') || ' ' || coalesce(${supportTickets.description}, '')) @@ plainto_tsquery('simple', ${q})`,
    ];
    if (support) {
      parts.push(
        sql`exists (select 1 from tenants tn where tn.id = ${supportTickets.tenantId} and tn.display_name ilike ${like})`,
        sql`exists (select 1 from support_ticket_tags tt join support_tags tg on tg.id = tt.tag_id where tt.ticket_id = ${supportTickets.id} and tg.label ilike ${like})`,
      );
    }
    return or(...parts) as SQL;
  }

  private supportScope<T>(
    principal: ForgePrincipal,
    fn: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    if (!this.isSupportAgent(principal))
      throw new ForgeError("FORBIDDEN", "Support access required");
    return this.crossTenant(principal)
      ? withBypassRlsTransaction(this.db, fn, principal.userId)
      : withTenantTransaction(this.db, this.tenantOf(principal), fn, principal.userId);
  }

  private scopeConditions(principal: ForgePrincipal): SQL[] {
    const conditions: SQL[] = [isNull(supportTickets.deletedAt)];
    if (!this.crossTenant(principal))
      conditions.push(eq(supportTickets.tenantId, this.tenantOf(principal)));
    return conditions;
  }

  async supportSummary(principal: ForgePrincipal) {
    return this.supportScope(principal, async (tx) => {
      const open = sql.raw(HELPDESK_OPEN_STATUSES.map((s) => `'${s}'`).join(","));
      const [row] = (await tx
        .select({
          open: sql<number>`count(*) filter (where ${supportTickets.status} in (${open}))::int`,
          critical: sql<number>`count(*) filter (where ${supportTickets.status} in (${open}) and ${supportTickets.priority} = 'P1_CRITICAL')::int`,
          high: sql<number>`count(*) filter (where ${supportTickets.status} in (${open}) and ${supportTickets.priority} = 'P2_HIGH')::int`,
          unassigned: sql<number>`count(*) filter (where ${supportTickets.status} in (${open}) and ${supportTickets.assignedUserId} is null)::int`,
          mine: sql<number>`count(*) filter (where ${supportTickets.status} in (${open}) and ${supportTickets.assignedUserId} = ${principal.userId}::uuid)::int`,
          waitingOnCustomer: sql<number>`count(*) filter (where ${supportTickets.status} = 'WAITING_ON_CUSTOMER')::int`,
          waitingOnForge: sql<number>`count(*) filter (where ${supportTickets.status} = 'WAITING_ON_FORGE')::int`,
          newToday: sql<number>`count(*) filter (where ${supportTickets.createdAt} >= date_trunc('day', now()))::int`,
          resolvedToday: sql<number>`count(*) filter (where ${supportTickets.resolvedAt} >= date_trunc('day', now()))::int`,
        })
        .from(supportTickets)
        .where(and(...this.scopeConditions(principal)))) as Array<Record<string, number>>;
      return {
        ...(row ?? {}),
        slaRisk: null,
        slaBreached: null,
        crossTenant: this.crossTenant(principal),
      };
    });
  }

  async supportList(principal: ForgePrincipal, query: Record<string, unknown>) {
    const queue = parseQueue(query.queue);
    const { page, pageSize, offset } = parsePaging(query, 200);
    const str = (key: string) => String(query[key] ?? "").trim();

    const result = await this.supportScope(principal, async (tx) => {
      const conditions = this.scopeConditions(principal);
      const openList = [...HELPDESK_OPEN_STATUSES];
      switch (queue) {
        case "open":
          conditions.push(inArray(supportTickets.status, openList));
          break;
        case "unassigned":
          conditions.push(
            inArray(supportTickets.status, openList),
            isNull(supportTickets.assignedUserId),
          );
          break;
        case "mine":
          conditions.push(
            inArray(supportTickets.status, openList),
            eq(supportTickets.assignedUserId, principal.userId),
          );
          break;
        case "critical":
          conditions.push(
            inArray(supportTickets.status, openList),
            eq(supportTickets.priority, "P1_CRITICAL"),
          );
          break;
        case "high":
          conditions.push(
            inArray(supportTickets.status, openList),
            eq(supportTickets.priority, "P2_HIGH"),
          );
          break;
        case "waiting_customer":
          conditions.push(eq(supportTickets.status, "WAITING_ON_CUSTOMER"));
          break;
        case "waiting_forge":
          conditions.push(eq(supportTickets.status, "WAITING_ON_FORGE"));
          break;
        case "feature_requests":
          conditions.push(
            or(
              eq(supportTickets.requestType, "FEATURE_REQUEST"),
              eq(supportTickets.disposition, "FEATURE_REQUEST"),
            ) as SQL,
          );
          break;
        case "bugs":
          conditions.push(eq(supportTickets.disposition, "BUG_CONFIRMED"));
          break;
        case "known_issues":
          conditions.push(eq(supportTickets.disposition, "KNOWN_ISSUE"));
          break;
        case "closed":
          conditions.push(inArray(supportTickets.status, ["RESOLVED", "CLOSED"]));
          break;
        default:
          break;
      }
      if (isHelpdeskStatus(str("status")))
        conditions.push(eq(supportTickets.status, str("status")));
      if (str("priority")) conditions.push(eq(supportTickets.priority, str("priority")));
      if (UUID.test(str("tenantId")) && this.crossTenant(principal)) {
        conditions.push(eq(supportTickets.tenantId, str("tenantId")));
      }
      if (str("productCode")) conditions.push(eq(supportTickets.productCode, str("productCode")));
      if (str("requestType")) conditions.push(eq(supportTickets.requestType, str("requestType")));
      if (str("productArea")) conditions.push(eq(supportTickets.productArea, str("productArea")));
      if (UUID.test(str("assigneeUserId")))
        conditions.push(eq(supportTickets.assignedUserId, str("assigneeUserId")));
      if (UUID.test(str("tagId"))) {
        conditions.push(
          sql`exists (select 1 from support_ticket_tags tt where tt.ticket_id = ${supportTickets.id} and tt.tag_id = ${str("tagId")}::uuid)`,
        );
      }
      const from = Date.parse(str("createdFrom"));
      const to = Date.parse(str("createdTo"));
      if (Number.isFinite(from)) conditions.push(gte(supportTickets.createdAt, new Date(from)));
      if (Number.isFinite(to)) conditions.push(lte(supportTickets.createdAt, new Date(to)));
      if (str("q")) conditions.push(this.searchCondition(str("q"), true));

      const where = and(...conditions);
      const sort = str("sort");
      const orderBy =
        sort === "newest"
          ? [desc(supportTickets.createdAt)]
          : sort === "oldest"
            ? [asc(supportTickets.createdAt)]
            : sort === "updated"
              ? [desc(supportTickets.updatedAt)]
              : [asc(supportTickets.priority), asc(supportTickets.createdAt)];

      const total = await this.countTickets(tx, where);
      const rows = (await tx
        .select()
        .from(supportTickets)
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset(offset)) as TicketRow[];
      return { rows, total };
    });

    const names = await this.tenantNames(result.rows.map((r) => r.tenantId));
    return {
      items: result.rows.map((r) => toSupportTicket(r, names.get(r.tenantId) ?? null)),
      page,
      pageSize,
      total: result.total,
      queue,
    };
  }

  async supportTicketDetail(principal: ForgePrincipal, id: string) {
    const detail = await this.withSupportTicket(principal, id, async (tx, ticket) => {
      const [messages, attachments, events] = await this.loadThread(tx, ticket.id);
      const tags = await tx
        .select({
          id: supportTags.id,
          slug: supportTags.slug,
          label: supportTags.label,
          color: supportTags.color,
        })
        .from(supportTicketTags)
        .innerJoin(supportTags, eq(supportTags.id, supportTicketTags.tagId))
        .where(eq(supportTicketTags.ticketId, ticket.id))
        .orderBy(asc(supportTags.label));
      const watchers = await tx
        .select({ userId: supportTicketWatchers.userId, name: supportTicketWatchers.userName })
        .from(supportTicketWatchers)
        .where(eq(supportTicketWatchers.ticketId, ticket.id))
        .orderBy(asc(supportTicketWatchers.userName));
      return { ticket, messages, attachments, events, tags, watchers };
    });
    const names = await this.tenantNames([detail.ticket.tenantId]);
    return {
      ticket: toSupportTicket(detail.ticket, names.get(detail.ticket.tenantId) ?? null),
      messages: detail.messages.map(toMessage),
      attachments: detail.attachments.filter((a) => a.status === "COMPLETE").map(toAttachment),
      events: detail.events.map(toEvent),
      tags: detail.tags,
      watchers: detail.watchers,
      allowedStatuses: allowedHelpdeskTransitions(
        detail.ticket.status as HelpdeskTicketStatus,
        "SUPPORT",
      ),
    };
  }

  async supportAgents(principal: ForgePrincipal) {
    if (!this.isSupportAgent(principal))
      throw new ForgeError("FORBIDDEN", "Support access required");
    const tenantFilter = this.crossTenant(principal)
      ? sql``
      : sql`and u.tenant_id = ${this.tenantOf(principal)}::uuid`;
    const result = await withBypassRlsTransaction(this.db, (tx) =>
      tx.execute(sql`
        with holders as (
          select m.user_id, mra.role_id
          from membership_role_assignments mra
          join user_tenant_memberships m on m.id = mra.membership_id
          where mra.status = 'ACTIVE' and mra.revoked_at is null and m.status = 'ACTIVE'
          union
          select ura.user_id, ura.role_id from user_role_assignments ura where ura.revoked_at is null
        )
        select distinct u.id::text as user_id, u.primary_email as email, u.username,
          p.display_name, p.first_name, p.last_name
        from holders h
        join roles r on r.id = h.role_id
        join users u on u.id = h.user_id and u.tenant_id = r.tenant_id
        left join persons p on p.id = u.person_id
        where u.disabled_at is null
          and (
            r.code = 'PLATFORM_SUPER_ADMIN'
            or exists (
              select 1 from role_permissions rp
              join permissions pm on pm.id = rp.permission_id
              where rp.role_id = r.id and rp.effect = 'ALLOW' and pm.code = 'helpdesk.support.view'
            )
          )
          ${tenantFilter}
        limit 300
      `),
    );
    const agents = rowsOf<{
      user_id: string;
      email: string | null;
      username: string | null;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>(result).map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: displayName({
        displayName: r.display_name,
        firstName: r.first_name,
        lastName: r.last_name,
        username: r.username,
        email: r.email,
      }),
    }));
    agents.sort((a, b) => a.name.localeCompare(b.name));
    return { agents };
  }

  async supportTags(principal: ForgePrincipal) {
    return this.supportScope(principal, async (tx) => {
      const rows = await tx
        .select({
          id: supportTags.id,
          slug: supportTags.slug,
          label: supportTags.label,
          color: supportTags.color,
          tenantId: supportTags.tenantId,
        })
        .from(supportTags)
        .where(eq(supportTags.active, true))
        .orderBy(asc(supportTags.label));
      const scoped = this.crossTenant(principal)
        ? rows.filter((r) => r.tenantId === null)
        : rows.filter((r) => r.tenantId === null || r.tenantId === this.tenantOf(principal));
      return { tags: scoped.map(({ tenantId: _t, ...rest }) => rest) };
    });
  }

  async supportReply(principal: ForgePrincipal, id: string, body: unknown) {
    this.require(
      principal,
      "helpdesk.support.respond",
      "You do not have permission to reply to customers",
    );
    const input = supportReplySchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "SUPPORT");
    const result = await this.withSupportTicket(principal, id, async (tx, current) => {
      const from = current.status as HelpdeskTicketStatus;
      let next = input.nextStatus ?? null;
      if (next && next !== from) {
        this.require(
          principal,
          "helpdesk.support.change_status",
          "You do not have permission to change ticket status",
        );
        if (!canTransitionHelpdeskStatus(from, next, "SUPPORT")) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            `Cannot move a ${HELPDESK_STATUS_LABELS[from]} ticket to ${HELPDESK_STATUS_LABELS[next]}`,
          );
        }
      } else {
        next = null;
      }
      if (from === "CLOSED" && !next) {
        throw new ForgeError("VALIDATION_FAILED", "Reopen this ticket before replying");
      }
      const now = new Date();
      const messageId = createId();
      await tx.insert(supportTicketMessages).values({
        id: messageId,
        tenantId: current.tenantId,
        ticketId: current.id,
        authorUserId: principal.userId,
        authorName: actor.name,
        authorType: "SUPPORT",
        messageType: "SUPPORT_REPLY",
        body: input.body,
        isInternal: false,
      });
      const ticket = await this.updateTicket(tx, current, {
        lastSupportActivityAt: now,
        firstResponseAt: current.firstResponseAt ?? now,
        ...(next ? this.statusPatch(next, now) : {}),
      });
      if (next)
        await this.addEvent(tx, ticket, actor, this.statusEventType(next), { from, to: next });
      await this.writeAudit(tx, principal, ticket.tenantId, "helpdesk.message.created", ticket.id, {
        metadata: {
          messageId,
          messageType: "SUPPORT_REPLY",
          mode: "CUSTOMER_REPLY",
          statusChangedTo: next,
        },
      });
      return { ticket, messageId };
    });
    await this.notify(principal, result.ticket.requesterUserId, {
      type: "helpdesk.support_reply",
      title: `Forge Support replied on ${result.ticket.ticketNumber}`,
      body: input.body.slice(0, 280),
      href: `/help-desk/?ticket=${result.ticket.id}`,
    });
    return { messageId: result.messageId, ticket: toSupportTicket(result.ticket, null) };
  }

  async supportInternalNote(principal: ForgePrincipal, id: string, body: unknown) {
    this.require(
      principal,
      "helpdesk.support.internal_note",
      "You do not have permission to add internal notes",
    );
    const input = messageSchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "SUPPORT");
    return this.withSupportTicket(principal, id, async (tx, current) => {
      const messageId = createId();
      await tx.insert(supportTicketMessages).values({
        id: messageId,
        tenantId: current.tenantId,
        ticketId: current.id,
        authorUserId: principal.userId,
        authorName: actor.name,
        authorType: "SUPPORT",
        messageType: "INTERNAL_NOTE",
        body: input.body,
        isInternal: true,
      });
      const ticket = await this.updateTicket(tx, current, { lastSupportActivityAt: new Date() });
      await this.writeAudit(
        tx,
        principal,
        ticket.tenantId,
        "helpdesk.internal_note.created",
        ticket.id,
        {
          metadata: { messageId, messageType: "INTERNAL_NOTE", mode: "INTERNAL_NOTE" },
        },
      );
      return { messageId, ticket: toSupportTicket(ticket, null) };
    });
  }

  private statusPatch(
    next: HelpdeskTicketStatus,
    now: Date,
  ): Partial<typeof supportTickets.$inferInsert> {
    if (next === "RESOLVED") return { status: next, resolvedAt: now };
    if (next === "CLOSED") return { status: next, closedAt: now };
    if (next === "REOPENED")
      return { status: next, reopenedAt: now, resolvedAt: null, closedAt: null };
    return { status: next };
  }

  private statusEventType(next: HelpdeskTicketStatus): string {
    if (next === "RESOLVED") return "RESOLVED";
    if (next === "CLOSED") return "CLOSED";
    if (next === "REOPENED") return "REOPENED";
    return "STATUS_CHANGED";
  }

  async supportChangeStatus(principal: ForgePrincipal, id: string, body: unknown) {
    this.require(
      principal,
      "helpdesk.support.change_status",
      "You do not have permission to change ticket status",
    );
    const input = statusChangeSchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "SUPPORT");
    const ticket = await this.withSupportTicket(principal, id, async (tx, current) => {
      const from = current.status as HelpdeskTicketStatus;
      const next = input.status;
      if (!canTransitionHelpdeskStatus(from, next, "SUPPORT")) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          `Cannot move a ${HELPDESK_STATUS_LABELS[from]} ticket to ${HELPDESK_STATUS_LABELS[next]}`,
        );
      }
      const now = new Date();
      const dispositionChanged =
        input.disposition !== undefined && input.disposition !== current.disposition;
      const updated = await this.updateTicket(
        tx,
        current,
        {
          ...this.statusPatch(next, now),
          ...(input.disposition !== undefined ? { disposition: input.disposition } : {}),
          lastSupportActivityAt: now,
        },
        input.expectedVersion,
      );
      await this.addEvent(tx, updated, actor, this.statusEventType(next), { from, to: next });
      if (dispositionChanged) {
        await this.addEvent(tx, updated, actor, "DISPOSITION_CHANGED", {
          from: current.disposition,
          to: input.disposition ?? null,
          internal: true,
        });
      }
      if (input.note) {
        await tx.insert(supportTicketMessages).values({
          id: createId(),
          tenantId: updated.tenantId,
          ticketId: updated.id,
          authorUserId: principal.userId,
          authorName: actor.name,
          authorType: "SUPPORT",
          messageType: "INTERNAL_NOTE",
          body: input.note,
          isInternal: true,
        });
      }
      await this.writeAudit(
        tx,
        principal,
        updated.tenantId,
        `helpdesk.ticket.${this.statusEventType(next).toLowerCase()}`,
        updated.id,
        {
          before: { status: from, disposition: current.disposition },
          after: { status: next, disposition: updated.disposition },
        },
      );
      return updated;
    });
    if (["RESOLVED", "WAITING_ON_CUSTOMER", "CLOSED"].includes(input.status)) {
      await this.notify(principal, ticket.requesterUserId, {
        type: "helpdesk.status_changed",
        title: `${ticket.ticketNumber} is now ${HELPDESK_STATUS_LABELS[input.status].toLowerCase()}`,
        body: ticket.subject,
        href: `/help-desk/?ticket=${ticket.id}`,
      });
    }
    return { ticket: toSupportTicket(ticket, null) };
  }

  async supportChangePriority(principal: ForgePrincipal, id: string, body: unknown) {
    this.require(
      principal,
      "helpdesk.support.change_priority",
      "You do not have permission to change priority",
    );
    const input = priorityChangeSchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "SUPPORT");
    return this.withSupportTicket(principal, id, async (tx, current) => {
      if (current.priority === input.priority) return { ticket: toSupportTicket(current, null) };
      const updated = await this.updateTicket(
        tx,
        current,
        { priority: input.priority },
        input.expectedVersion,
      );
      await this.addEvent(tx, updated, actor, "PRIORITY_CHANGED", {
        from: current.priority,
        to: input.priority,
        internal: true,
      });
      await this.writeAudit(
        tx,
        principal,
        updated.tenantId,
        "helpdesk.ticket.priority_changed",
        updated.id,
        {
          before: { priority: current.priority },
          after: { priority: input.priority },
        },
      );
      return { ticket: toSupportTicket(updated, null) };
    });
  }

  async supportAssign(principal: ForgePrincipal, id: string, body: unknown) {
    this.require(
      principal,
      "helpdesk.support.assign",
      "You do not have permission to assign tickets",
    );
    const input = assignSchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "SUPPORT");
    let assigneeName: string | null = null;
    if (input.assigneeUserId) {
      const { agents } = await this.supportAgents(principal);
      const agent = agents.find((a) => a.userId === input.assigneeUserId);
      if (!agent)
        throw new ForgeError("VALIDATION_FAILED", "Assignee must be a Forge support agent");
      assigneeName = agent.name;
    }
    const ticket = await this.withSupportTicket(principal, id, async (tx, current) => {
      if (
        current.assignedUserId === input.assigneeUserId &&
        (input.team ?? current.assignedTeam) === current.assignedTeam
      ) {
        return current;
      }
      const from = current.status as HelpdeskTicketStatus;
      const autoAssign = Boolean(input.assigneeUserId) && (from === "NEW" || from === "TRIAGE");
      const updated = await this.updateTicket(tx, current, {
        assignedUserId: input.assigneeUserId,
        assignedUserName: assigneeName,
        ...(input.team !== undefined ? { assignedTeam: input.team } : {}),
        ...(autoAssign ? { status: "ASSIGNED" } : {}),
      });
      const eventType = !input.assigneeUserId
        ? "UNASSIGNED"
        : current.assignedUserId
          ? "REASSIGNED"
          : "ASSIGNED";
      await this.addEvent(tx, updated, actor, eventType, {
        from: current.assignedUserName,
        to: assigneeName,
        internal: true,
      });
      if (autoAssign)
        await this.addEvent(tx, updated, actor, "STATUS_CHANGED", { from, to: "ASSIGNED" });
      await this.writeAudit(
        tx,
        principal,
        updated.tenantId,
        "helpdesk.ticket.assignee_changed",
        updated.id,
        {
          before: { assignedUserId: current.assignedUserId, assignedTeam: current.assignedTeam },
          after: { assignedUserId: updated.assignedUserId, assignedTeam: updated.assignedTeam },
        },
      );
      return updated;
    });
    if (input.assigneeUserId) {
      await this.notify(principal, input.assigneeUserId, {
        type: "helpdesk.ticket_assigned",
        title: `${ticket.ticketNumber} assigned to you`,
        body: `${HELPDESK_PRIORITY_META[ticket.priority as keyof typeof HELPDESK_PRIORITY_META]?.short ?? ""} - ${ticket.subject}`,
        href: `/help-desk/support/?ticket=${ticket.id}`,
        priority: ticket.priority === "P1_CRITICAL" ? "HIGH" : "NORMAL",
      });
    }
    return { ticket: toSupportTicket(ticket, null) };
  }

  async supportTagsChange(principal: ForgePrincipal, id: string, body: unknown) {
    this.require(
      principal,
      "helpdesk.support.manage_watchers",
      "You do not have permission to tag tickets",
    );
    const input = tagChangeSchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "SUPPORT");
    const slugs = [...new Set(input.add.map(slugifyTag).filter(Boolean))];

    // Resolve tag ids up front; new global tags need platform scope to insert tenant_id NULL rows.
    const tagIds = new Map<string, { id: string; label: string }>();
    if (slugs.length) {
      await withBypassRlsTransaction(
        this.db,
        async (tx) => {
          const rows = await tx
            .select({
              id: supportTags.id,
              slug: supportTags.slug,
              label: supportTags.label,
              tenantId: supportTags.tenantId,
            })
            .from(supportTags)
            .where(and(inArray(supportTags.slug, slugs), isNull(supportTags.tenantId)));
          for (const r of rows) tagIds.set(r.slug, { id: r.id, label: r.label });
          const missing = slugs.filter((s) => !tagIds.has(s));
          if (missing.length && !this.has(principal, "helpdesk.admin.tags")) {
            throw new ForgeError("VALIDATION_FAILED", `Unknown tag: ${missing.join(", ")}`);
          }
          for (const slug of missing) {
            const tagId = createId();
            const label =
              input.add
                .find((l) => slugifyTag(l) === slug)
                ?.trim()
                .slice(0, 80) || slug;
            await tx.insert(supportTags).values({ id: tagId, tenantId: null, slug, label });
            tagIds.set(slug, { id: tagId, label });
          }
        },
        principal.userId,
      );
    }

    return this.withSupportTicket(principal, id, async (tx, ticket) => {
      const existing = await tx
        .select({ tagId: supportTicketTags.tagId })
        .from(supportTicketTags)
        .where(eq(supportTicketTags.ticketId, ticket.id));
      const have = new Set(existing.map((e) => e.tagId));
      const added: string[] = [];
      for (const { id: tagId, label } of tagIds.values()) {
        if (have.has(tagId)) continue;
        await tx.insert(supportTicketTags).values({
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          tagId,
          addedByUserId: principal.userId,
        });
        await this.addEvent(tx, ticket, actor, "TAG_ADDED", { to: label, internal: true });
        added.push(label);
      }
      const toRemove = input.remove.filter((tagId) => have.has(tagId));
      if (toRemove.length) {
        const labels = await tx
          .select({ id: supportTags.id, label: supportTags.label })
          .from(supportTags)
          .where(inArray(supportTags.id, toRemove));
        await tx
          .delete(supportTicketTags)
          .where(
            and(
              eq(supportTicketTags.ticketId, ticket.id),
              inArray(supportTicketTags.tagId, toRemove),
            ),
          );
        for (const l of labels)
          await this.addEvent(tx, ticket, actor, "TAG_REMOVED", { from: l.label, internal: true });
      }
      if (added.length || toRemove.length) {
        await this.updateTicket(tx, ticket, {});
        await this.writeAudit(
          tx,
          principal,
          ticket.tenantId,
          "helpdesk.ticket.tags_changed",
          ticket.id,
          {
            metadata: { added, removed: toRemove },
          },
        );
      }
      return { added, removed: toRemove };
    });
  }

  async supportWatchersChange(principal: ForgePrincipal, id: string, body: unknown) {
    this.require(
      principal,
      "helpdesk.support.manage_watchers",
      "You do not have permission to manage watchers",
    );
    const input = watcherChangeSchema.parse(body ?? {});
    const actor = await this.actorFor(principal, "SUPPORT");
    const { agents } = input.add.length ? await this.supportAgents(principal) : { agents: [] };
    const agentById = new Map(agents.map((a) => [a.userId, a]));
    for (const userId of input.add) {
      if (!agentById.has(userId))
        throw new ForgeError("VALIDATION_FAILED", "Watchers must be Forge support agents");
    }
    return this.withSupportTicket(principal, id, async (tx, ticket) => {
      const existing = await tx
        .select({ userId: supportTicketWatchers.userId, name: supportTicketWatchers.userName })
        .from(supportTicketWatchers)
        .where(eq(supportTicketWatchers.ticketId, ticket.id));
      const have = new Map(existing.map((e) => [e.userId, e.name]));
      const added: string[] = [];
      for (const userId of input.add) {
        if (have.has(userId)) continue;
        const agent = agentById.get(userId)!;
        await tx.insert(supportTicketWatchers).values({
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          userId,
          userName: agent.name,
          addedByUserId: principal.userId,
        });
        await this.addEvent(tx, ticket, actor, "WATCHER_ADDED", { to: agent.name, internal: true });
        added.push(userId);
      }
      const toRemove = input.remove.filter((u) => have.has(u));
      if (toRemove.length) {
        await tx
          .delete(supportTicketWatchers)
          .where(
            and(
              eq(supportTicketWatchers.ticketId, ticket.id),
              inArray(supportTicketWatchers.userId, toRemove),
            ),
          );
        for (const u of toRemove)
          await this.addEvent(tx, ticket, actor, "WATCHER_REMOVED", {
            from: have.get(u) ?? null,
            internal: true,
          });
      }
      if (added.length || toRemove.length) {
        await this.writeAudit(
          tx,
          principal,
          ticket.tenantId,
          "helpdesk.ticket.watchers_changed",
          ticket.id,
          {
            metadata: { added, removed: toRemove },
          },
        );
      }
      return { added, removed: toRemove };
    });
  }

  // ---------------------------------------------------------------- attachments

  private async ticketForMode(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    mode: Mode,
    tenantId: string,
    ticketId: string,
  ): Promise<TicketRow> {
    if (mode === "customer") return this.customerTicket(tx, principal, ticketId);
    const ticket = await this.findTicket(tx, tenantId, ticketId);
    if (!ticket) throw new ForgeError("NOT_FOUND", "Ticket not found");
    return ticket;
  }

  private async attachmentTenant(
    principal: ForgePrincipal,
    mode: Mode,
    ticketId: string,
  ): Promise<string> {
    if (mode === "support") return this.supportTicketTenant(principal, ticketId);
    return this.tenantOf(principal);
  }

  async createAttachmentUpload(principal: ForgePrincipal, mode: Mode, id: string, body: unknown) {
    if (mode === "customer") {
      this.require(
        principal,
        "helpdesk.ticket.comment",
        "You do not have permission to add attachments",
      );
    } else {
      this.require(
        principal,
        "helpdesk.support.respond",
        "You do not have permission to add attachments",
      );
    }
    const ticketId = assertUuid(id, "ticketId");
    const input = attachmentUploadSchema.parse(body ?? {});
    const mimeType = input.mimeType.toLowerCase();
    if (!isAllowedHelpdeskAttachmentMime(mimeType)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "File type not allowed. Use an image, PDF, Word, Excel, CSV, text file, or MP4/MOV video.",
      );
    }
    if (input.contentLength > HELPDESK_MAX_ATTACHMENT_BYTES) {
      throw new ForgeError("VALIDATION_FAILED", "Attachments must be 25 MB or smaller");
    }
    const isInternal = mode === "support" && input.internal === true;
    const tenantId = await this.attachmentTenant(principal, mode, ticketId);
    const actor = await this.actorFor(principal, mode === "support" ? "SUPPORT" : "CUSTOMER");
    const storedFilename = this.storage.buildStoredFilename(input.filename);
    const objectKey = `${helpdeskAttachmentPrefix(tenantId, ticketId)}${createId()}-${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);
    const documentId = createId();
    const attachmentId = createId();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const ticket = await this.ticketForMode(tx, principal, mode, tenantId, ticketId);
        if (mode === "customer" && ticket.status === "CLOSED") {
          throw new ForgeError("VALIDATION_FAILED", "Reopen this ticket before adding attachments");
        }
        const now = new Date();
        await tx.insert(forgeDocuments).values({
          id: documentId,
          tenantId,
          originalFilename: input.filename,
          storedFilename,
          objectKey,
          bucketName: this.storage.bucketName,
          mimeType,
          fileSizeBytes: input.contentLength,
          securityClassification: "INTERNAL",
          malwareScanStatus: "PENDING",
          retentionRule: "HELPDESK_ATTACHMENT_DEFAULT",
          uploadStatus: "INITIALIZED",
          source: HELPDESK_ATTACHMENT_SOURCE,
          uploadedByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(supportTicketAttachments).values({
          id: attachmentId,
          tenantId,
          ticketId,
          documentId,
          originalFilename: input.filename,
          mimeType,
          sizeBytes: input.contentLength,
          isInternal,
          status: "PENDING",
          uploadedByUserId: principal.userId,
          uploadedByName: actor.name,
          uploadedByType: actor.type,
        });
      },
      principal.userId,
    );

    const presign = await this.storage.createPresignedUploadUrl({
      objectKey,
      mimeType,
      contentLength: input.contentLength,
    });
    return {
      attachmentId,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mimeType,
    };
  }

  async completeAttachmentUpload(
    principal: ForgePrincipal,
    mode: Mode,
    id: string,
    attachmentId: string,
  ) {
    const ticketId = assertUuid(id, "ticketId");
    const attId = assertUuid(attachmentId, "attachmentId");
    const tenantId = await this.attachmentTenant(principal, mode, ticketId);
    const actor = await this.actorFor(principal, mode === "support" ? "SUPPORT" : "CUSTOMER");
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const ticket = await this.ticketForMode(tx, principal, mode, tenantId, ticketId);
        const [att] = (await tx
          .select()
          .from(supportTicketAttachments)
          .where(
            and(
              eq(supportTicketAttachments.id, attId),
              eq(supportTicketAttachments.ticketId, ticket.id),
              isNull(supportTicketAttachments.deletedAt),
            ),
          )
          .limit(1)) as AttachmentRow[];
        if (!att) throw new ForgeError("NOT_FOUND", "Attachment not found");
        if (att.uploadedByUserId !== principal.userId)
          throw new ForgeError("FORBIDDEN", "Only the uploader can finish this upload");
        if (att.status === "COMPLETE") return { attachment: toAttachment(att) };
        const document = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, att.documentId), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!document || !documentBelongsToTenant(document.tenantId, tenantId)) {
          throw new ForgeError("NOT_FOUND", "Document not found");
        }
        if (
          !objectKeyBelongsToTenant(document.objectKey, tenantId) ||
          !document.objectKey.startsWith(helpdeskAttachmentPrefix(tenantId, ticket.id))
        ) {
          throw new ForgeError("FORBIDDEN", "Document does not belong to this ticket");
        }
        await this.storage.assertObjectExists(document.objectKey);
        const now = new Date();
        await tx
          .update(forgeDocuments)
          .set({ uploadStatus: "COMPLETE", uploadedAt: now, updatedAt: now })
          .where(eq(forgeDocuments.id, document.id));
        const [updated] = (await tx
          .update(supportTicketAttachments)
          .set({ status: "COMPLETE", uploadedAt: now })
          .where(eq(supportTicketAttachments.id, att.id))
          .returning()) as AttachmentRow[];
        await this.addEvent(tx, ticket, actor, "ATTACHMENT_ADDED", {
          to: att.originalFilename,
          internal: att.isInternal,
        });
        await this.updateTicket(
          tx,
          ticket,
          mode === "customer" ? { lastCustomerActivityAt: now } : { lastSupportActivityAt: now },
        );
        await this.writeAudit(tx, principal, tenantId, "helpdesk.attachment.added", ticket.id, {
          metadata: {
            attachmentId: att.id,
            documentId: att.documentId,
            filename: att.originalFilename,
            internal: att.isInternal,
          },
        });
        return { attachment: toAttachment(updated!) };
      },
      principal.userId,
    );
  }

  async attachmentDownload(
    principal: ForgePrincipal,
    mode: Mode,
    id: string,
    attachmentId: string,
  ) {
    const ticketId = assertUuid(id, "ticketId");
    const attId = assertUuid(attachmentId, "attachmentId");
    const tenantId = await this.attachmentTenant(principal, mode, ticketId);
    const doc = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const ticket = await this.ticketForMode(tx, principal, mode, tenantId, ticketId);
        const [att] = (await tx
          .select()
          .from(supportTicketAttachments)
          .where(
            and(
              eq(supportTicketAttachments.id, attId),
              eq(supportTicketAttachments.ticketId, ticket.id),
              eq(supportTicketAttachments.status, "COMPLETE"),
              isNull(supportTicketAttachments.deletedAt),
            ),
          )
          .limit(1)) as AttachmentRow[];
        if (!att || (mode === "customer" && att.isInternal))
          throw new ForgeError("NOT_FOUND", "Attachment not found");
        const document = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, att.documentId), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!document || !objectKeyBelongsToTenant(document.objectKey, tenantId)) {
          throw new ForgeError("NOT_FOUND", "Attachment not found");
        }
        return document;
      },
      principal.userId,
    );
    const inline = doc.mimeType.startsWith("image/") || doc.mimeType === "application/pdf";
    const download = await this.storage.createPresignedDownloadUrl({
      objectKey: doc.objectKey,
      mimeType: doc.mimeType,
      filename: doc.originalFilename,
      inline,
    });
    return {
      fileName: doc.originalFilename,
      mimeType: doc.mimeType,
      downloadUrl: download.downloadUrl,
      expiresAt: download.expiresAt,
    };
  }

  async deleteAttachment(principal: ForgePrincipal, mode: Mode, id: string, attachmentId: string) {
    const ticketId = assertUuid(id, "ticketId");
    const attId = assertUuid(attachmentId, "attachmentId");
    const tenantId = await this.attachmentTenant(principal, mode, ticketId);
    const actor = await this.actorFor(principal, mode === "support" ? "SUPPORT" : "CUSTOMER");
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const ticket = await this.ticketForMode(tx, principal, mode, tenantId, ticketId);
        const [att] = (await tx
          .select()
          .from(supportTicketAttachments)
          .where(
            and(
              eq(supportTicketAttachments.id, attId),
              eq(supportTicketAttachments.ticketId, ticket.id),
              isNull(supportTicketAttachments.deletedAt),
            ),
          )
          .limit(1)) as AttachmentRow[];
        if (!att || (mode === "customer" && att.isInternal))
          throw new ForgeError("NOT_FOUND", "Attachment not found");
        if (mode === "customer" && att.uploadedByUserId !== principal.userId) {
          throw new ForgeError("FORBIDDEN", "You can only remove attachments you uploaded");
        }
        const now = new Date();
        await tx
          .update(supportTicketAttachments)
          .set({ deletedAt: now, deletedByUserId: principal.userId })
          .where(eq(supportTicketAttachments.id, att.id));
        await this.addEvent(tx, ticket, actor, "ATTACHMENT_REMOVED", {
          from: att.originalFilename,
          internal: att.isInternal,
        });
        await this.writeAudit(tx, principal, tenantId, "helpdesk.attachment.removed", ticket.id, {
          metadata: {
            attachmentId: att.id,
            documentId: att.documentId,
            filename: att.originalFilename,
          },
        });
        return { removed: att.id };
      },
      principal.userId,
    );
  }
}
