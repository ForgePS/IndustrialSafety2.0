import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import {
  createId,
  industrialCalendarCategories,
  industrialCalendarEvents,
  industrialReminders,
  industrialTasks,
  users,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";

type ListQuery = Record<string, string | undefined>;

type CategoryRow = typeof industrialCalendarCategories.$inferSelect;
type EventRow = typeof industrialCalendarEvents.$inferSelect;

const DEFAULT_CATEGORIES: Array<{ name: string; color: string; sortOrder: number }> = [
  { name: "General", color: "#696cff", sortOrder: 10 },
  { name: "Meeting", color: "#03c3ec", sortOrder: 20 },
  { name: "Training", color: "#71dd37", sortOrder: 30 },
  { name: "Inspection", color: "#ffab00", sortOrder: 40 },
  { name: "Safety", color: "#ff3e1d", sortOrder: 50 },
  { name: "Compliance", color: "#8592a3", sortOrder: 60 },
  { name: "Maintenance", color: "#233446", sortOrder: 70 },
  { name: "Deadline", color: "#e83e8c", sortOrder: 80 },
];

/** Accept RFC 4122/9562 UUIDs including Forge createId() UUIDv7 values. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asOptionalUuid(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!UUID_RE.test(raw)) {
    throw new ForgeError("VALIDATION_FAILED", "Invalid UUID");
  }
  return raw;
}

function asRequiredString(value: unknown, field: string, max = 500): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new ForgeError("VALIDATION_FAILED", `${field} is required`);
  if (raw.length > max) throw new ForgeError("VALIDATION_FAILED", `${field} is too long`);
  return raw;
}

function asDate(value: unknown, field: string): Date {
  const raw = String(value ?? "").trim();
  if (!raw) throw new ForgeError("VALIDATION_FAILED", `${field} is required`);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new ForgeError("VALIDATION_FAILED", `${field} is invalid`);
  return d;
}

function asChannel(value: unknown): "IN_APP" | "EMAIL" | "BOTH" {
  const raw = String(value ?? "IN_APP")
    .trim()
    .toUpperCase();
  if (raw === "EMAIL" || raw === "BOTH" || raw === "IN_APP") return raw;
  throw new ForgeError("VALIDATION_FAILED", "channel must be IN_APP, EMAIL, or BOTH");
}

function asRecipientUserIds(value: unknown, fallbackUserId: string): string[] {
  if (Array.isArray(value)) {
    const ids = value
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .filter((id) => UUID_RE.test(id));
    if (ids.length) return [...new Set(ids)];
  }
  return [fallbackUserId];
}

function asColor(value: unknown): string {
  const raw = String(value ?? "#696cff").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
    throw new ForgeError("VALIDATION_FAILED", "color must be a hex like #696cff");
  }
  return raw.toLowerCase();
}

/** Normalize to FREQ=DAILY|WEEKLY|MONTHLY or null for none. */
function asRecurrenceRule(value: unknown): string | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw || raw === "NONE") return null;
  if (raw === "DAILY" || raw === "WEEKLY" || raw === "MONTHLY") return `FREQ=${raw}`;
  const freq = raw.match(/FREQ=(DAILY|WEEKLY|MONTHLY)/)?.[1];
  if (freq) return `FREQ=${freq}`;
  throw new ForgeError(
    "VALIDATION_FAILED",
    "recurrenceRule must be NONE, DAILY, WEEKLY, or MONTHLY",
  );
}

function parseFreq(rule: string | null | undefined): "DAILY" | "WEEKLY" | "MONTHLY" | null {
  if (!rule) return null;
  const m = rule.toUpperCase().match(/FREQ=(DAILY|WEEKLY|MONTHLY)/);
  return (m?.[1] as "DAILY" | "WEEKLY" | "MONTHLY" | undefined) ?? null;
}

function asReminderOffsets(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const offsets = value
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 60 * 24 * 365)
    .map((n) => Math.round(n));
  return [...new Set(offsets)].slice(0, 10);
}

function mapCategory(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function mapEvent(
  row: EventRow,
  extras?: {
    category?: { id: string; name: string; color: string } | null;
    isOccurrence?: boolean;
    occurrenceStartsAt?: Date;
    occurrenceEndsAt?: Date;
  },
) {
  const startsAt = extras?.occurrenceStartsAt ?? row.startsAt;
  const endsAt = extras?.occurrenceEndsAt ?? row.endsAt;
  const seriesId = row.seriesId ?? (parseFreq(row.recurrenceRule) ? row.id : null);
  return {
    id: extras?.isOccurrence ? `${row.id}:${startsAt.toISOString()}` : row.id,
    sourceEventId: row.id,
    title: row.title,
    description: row.description,
    startsAt: startsAt?.toISOString() ?? null,
    endsAt: endsAt?.toISOString() ?? null,
    allDay: Boolean(row.allDay),
    status: row.status,
    siteId: row.siteId,
    categoryId: row.categoryId,
    category: extras?.category ?? null,
    recurrenceRule: row.recurrenceRule,
    recurrenceUntil: row.recurrenceUntil?.toISOString() ?? null,
    recurrenceCount: row.recurrenceCount,
    seriesId,
    isOccurrence: Boolean(extras?.isOccurrence),
    taskId: row.taskId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function mapReminder(row: typeof industrialReminders.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    eventId: row.eventId,
    taskId: row.taskId,
    remindAt: row.remindAt?.toISOString() ?? null,
    channel: row.channel,
    status: row.status,
    recipientUserIds: Array.isArray(row.recipientUserIds) ? row.recipientUserIds : [],
    createdByUserId: row.createdByUserId,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function advanceOccurrence(d: Date, freq: "DAILY" | "WEEKLY" | "MONTHLY"): Date {
  const next = new Date(d);
  if (freq === "DAILY") next.setDate(next.getDate() + 1);
  else if (freq === "WEEKLY") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function expandRecurring(
  row: EventRow,
  from: Date | null,
  to: Date | null,
  category: { id: string; name: string; color: string } | null,
  cap: number,
) {
  const freq = parseFreq(row.recurrenceRule);
  if (!freq) {
    if (from && row.endsAt < from) return [];
    if (to && row.startsAt > to) return [];
    return [mapEvent(row, { category, isOccurrence: false })];
  }

  const durationMs = Math.max(0, row.endsAt.getTime() - row.startsAt.getTime());
  const items: ReturnType<typeof mapEvent>[] = [];
  let cursor = new Date(row.startsAt);
  let count = 0;
  const hardCap = Math.min(row.recurrenceCount ?? 366, 366);
  const until = row.recurrenceUntil ?? null;

  while (count < hardCap && items.length < cap) {
    if (until && cursor > until) break;
    const occEnd = new Date(cursor.getTime() + durationMs);
    const inRange = (!from || occEnd >= from) && (!to || cursor <= to);
    if (inRange) {
      items.push(
        mapEvent(row, {
          category,
          isOccurrence: count > 0,
          occurrenceStartsAt: cursor,
          occurrenceEndsAt: occEnd,
        }),
      );
    }
    if (to && cursor > to) break;
    cursor = advanceOccurrence(cursor, freq);
    count += 1;
  }

  // Always include the series root as occurrence 0 when it falls in range
  if (items.length === 0 && (!from || row.endsAt >= from) && (!to || row.startsAt <= to)) {
    items.push(mapEvent(row, { category, isOccurrence: false }));
  }
  return items;
}

@Injectable()
export class IndustrialCalendarService {
  private readonly logger = new Logger(IndustrialCalendarService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => IndustrialDomainService))
    private readonly domain: IndustrialDomainService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  private async ensureDefaultCategories(tx: DatabaseTransaction, tenantId: string) {
    const existing = await tx
      .select({ id: industrialCalendarCategories.id })
      .from(industrialCalendarCategories)
      .where(
        and(
          eq(industrialCalendarCategories.tenantId, tenantId),
          isNull(industrialCalendarCategories.archivedAt),
        ),
      )
      .limit(1);
    if (existing.length) return;

    const now = new Date();
    await tx.insert(industrialCalendarCategories).values(
      DEFAULT_CATEGORIES.map((c) => ({
        id: createId(),
        tenantId,
        name: c.name,
        color: c.color,
        sortOrder: c.sortOrder,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  async listCategories(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.ensureDefaultCategories(tx, tenantId);
      return tx
        .select()
        .from(industrialCalendarCategories)
        .where(
          and(
            eq(industrialCalendarCategories.tenantId, tenantId),
            isNull(industrialCalendarCategories.archivedAt),
          ),
        )
        .orderBy(
          asc(industrialCalendarCategories.sortOrder),
          asc(industrialCalendarCategories.name),
        );
    });
    return { items: rows.map(mapCategory) };
  }

  async createCategory(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asRequiredString(body.name, "name", 120);
    const color = asColor(body.color);
    const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 100;
    const now = new Date();
    const id = createId();

    const created = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(industrialCalendarCategories)
        .values({
          id,
          tenantId,
          name,
          color,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
    if (!created) throw new ForgeError("INTERNAL_ERROR", "Failed to create category");
    return mapCategory(created);
  }

  async updateCategory(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const categoryId = asOptionalUuid(id);
    if (!categoryId) throw new ForgeError("VALIDATION_FAILED", "Category id is required");
    const now = new Date();

    const updated = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialCalendarCategories)
        .where(
          and(
            eq(industrialCalendarCategories.id, categoryId),
            eq(industrialCalendarCategories.tenantId, tenantId),
            isNull(industrialCalendarCategories.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Category not found");

      const patch: Partial<typeof industrialCalendarCategories.$inferInsert> = { updatedAt: now };
      if (body.name != null) patch.name = asRequiredString(body.name, "name", 120);
      if (body.color != null) patch.color = asColor(body.color);
      if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) {
        patch.sortOrder = Number(body.sortOrder);
      }

      const [row] = await tx
        .update(industrialCalendarCategories)
        .set(patch)
        .where(
          and(
            eq(industrialCalendarCategories.id, categoryId),
            eq(industrialCalendarCategories.tenantId, tenantId),
          ),
        )
        .returning();
      return row;
    });
    if (!updated) throw new ForgeError("INTERNAL_ERROR", "Failed to update category");
    return mapCategory(updated);
  }

  async archiveCategory(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const categoryId = asOptionalUuid(id);
    if (!categoryId) throw new ForgeError("VALIDATION_FAILED", "Category id is required");
    const now = new Date();

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: industrialCalendarCategories.id })
        .from(industrialCalendarCategories)
        .where(
          and(
            eq(industrialCalendarCategories.id, categoryId),
            eq(industrialCalendarCategories.tenantId, tenantId),
            isNull(industrialCalendarCategories.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Category not found");

      await tx
        .update(industrialCalendarCategories)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(industrialCalendarCategories.id, categoryId),
            eq(industrialCalendarCategories.tenantId, tenantId),
          ),
        );
      await tx
        .update(industrialCalendarEvents)
        .set({ categoryId: null, updatedAt: now })
        .where(
          and(
            eq(industrialCalendarEvents.categoryId, categoryId),
            eq(industrialCalendarEvents.tenantId, tenantId),
          ),
        );
    });
    return { id: categoryId, archived: true };
  }

  async listEvents(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const from = query.from ? asDate(query.from, "from") : null;
    const to = query.to ? asDate(query.to, "to") : null;
    const taskId = query.taskId ? asOptionalUuid(query.taskId) : null;
    const categoryId = query.categoryId ? asOptionalUuid(query.categoryId) : null;

    const { rows, categories } = await withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.ensureDefaultCategories(tx, tenantId);
      const cats = await tx
        .select()
        .from(industrialCalendarCategories)
        .where(
          and(
            eq(industrialCalendarCategories.tenantId, tenantId),
            isNull(industrialCalendarCategories.archivedAt),
          ),
        );

      const conditions = [
        eq(industrialCalendarEvents.tenantId, tenantId),
        isNull(industrialCalendarEvents.archivedAt),
      ];
      if (taskId) conditions.push(eq(industrialCalendarEvents.taskId, taskId));
      if (categoryId) conditions.push(eq(industrialCalendarEvents.categoryId, categoryId));

      // Include one-off events in range OR recurring series that may expand into range
      if (from && to) {
        conditions.push(
          or(
            and(
              gte(industrialCalendarEvents.endsAt, from),
              lte(industrialCalendarEvents.startsAt, to),
            ),
            and(
              sql`coalesce(${industrialCalendarEvents.recurrenceRule}, '') <> ''`,
              lte(industrialCalendarEvents.startsAt, to),
              or(
                isNull(industrialCalendarEvents.recurrenceUntil),
                gte(industrialCalendarEvents.recurrenceUntil, from),
              ),
            ),
          )!,
        );
      } else if (from) {
        conditions.push(
          or(
            gte(industrialCalendarEvents.endsAt, from),
            sql`coalesce(${industrialCalendarEvents.recurrenceRule}, '') <> ''`,
          )!,
        );
      } else if (to) {
        conditions.push(lte(industrialCalendarEvents.startsAt, to));
      }

      const eventRows = await tx
        .select()
        .from(industrialCalendarEvents)
        .where(and(...conditions))
        .orderBy(asc(industrialCalendarEvents.startsAt))
        .limit(500);

      return { rows: eventRows, categories: cats };
    });

    const catMap = new Map(
      categories.map((c) => [c.id, { id: c.id, name: c.name, color: c.color }]),
    );
    const expanded: ReturnType<typeof mapEvent>[] = [];
    for (const row of rows) {
      const cat = row.categoryId ? (catMap.get(row.categoryId) ?? null) : null;
      for (const item of expandRecurring(row, from, to, cat, 200 - expanded.length)) {
        expanded.push(item);
        if (expanded.length >= 200) break;
      }
      if (expanded.length >= 200) break;
    }

    expanded.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
    return { items: expanded };
  }

  async getEvent(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const sourceId = String(id).includes(":") ? String(id).split(":")[0]! : id;
    const eventId = asOptionalUuid(sourceId);
    if (!eventId) throw new ForgeError("VALIDATION_FAILED", "Event id is required");

    const { row, category } = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [found] = await tx
        .select()
        .from(industrialCalendarEvents)
        .where(
          and(
            eq(industrialCalendarEvents.id, eventId),
            eq(industrialCalendarEvents.tenantId, tenantId),
            isNull(industrialCalendarEvents.archivedAt),
          ),
        )
        .limit(1);
      if (!found) return { row: null, category: null };
      let cat: { id: string; name: string; color: string } | null = null;
      if (found.categoryId) {
        const [c] = await tx
          .select()
          .from(industrialCalendarCategories)
          .where(eq(industrialCalendarCategories.id, found.categoryId))
          .limit(1);
        if (c) cat = { id: c.id, name: c.name, color: c.color };
      }
      return { row: found, category: cat };
    });

    if (!row) throw new ForgeError("NOT_FOUND", "Calendar event not found");
    return mapEvent(row, { category });
  }

  private async insertReminderOffsets(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      eventId: string;
      taskId: string | null;
      title: string;
      startsAt: Date;
      offsets: number[];
      userId: string;
      now: Date;
    },
  ) {
    const offsets = input.offsets.length ? input.offsets : [15];
    for (const minutes of offsets) {
      await tx.insert(industrialReminders).values({
        id: createId(),
        tenantId: input.tenantId,
        eventId: input.eventId,
        taskId: input.taskId,
        title: `Reminder: ${input.title}`,
        remindAt: new Date(input.startsAt.getTime() - minutes * 60 * 1000),
        channel: "IN_APP",
        status: "PENDING",
        recipientUserIds: [input.userId],
        createdByUserId: input.userId,
        createdAt: input.now,
        updatedAt: input.now,
      });
    }
  }

  async createEvent(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const title = asRequiredString(body.title, "title");
    const description = body.description != null ? String(body.description).trim() || null : null;
    const startsAt = asDate(body.startsAt ?? body.startAt, "startsAt");
    const endsAt = asDate(body.endsAt ?? body.endAt ?? body.startsAt ?? body.startAt, "endsAt");
    if (endsAt.getTime() < startsAt.getTime()) {
      throw new ForgeError("VALIDATION_FAILED", "endsAt must be on or after startsAt");
    }
    const allDay = Boolean(body.allDay);
    const siteId = asOptionalUuid(body.siteId);
    const taskId = asOptionalUuid(body.taskId);
    const categoryId = asOptionalUuid(body.categoryId);
    const recurrenceRule = asRecurrenceRule(body.recurrenceRule);
    const recurrenceUntil =
      body.recurrenceUntil != null && String(body.recurrenceUntil).trim()
        ? asDate(body.recurrenceUntil, "recurrenceUntil")
        : null;
    const recurrenceCount =
      body.recurrenceCount != null && String(body.recurrenceCount).trim() !== ""
        ? Math.max(1, Math.min(366, Number(body.recurrenceCount)))
        : null;
    if (recurrenceCount != null && !Number.isFinite(recurrenceCount)) {
      throw new ForgeError("VALIDATION_FAILED", "recurrenceCount is invalid");
    }
    const offsets = asReminderOffsets(body.reminderOffsetsMinutes);
    const createDefaultReminder = body.createDefaultReminder !== false;
    const now = new Date();
    const id = createId();

    const created = await withTenantTransaction(this.db, tenantId, async (tx) => {
      if (taskId) {
        const [task] = await tx
          .select({ id: industrialTasks.id })
          .from(industrialTasks)
          .where(
            and(
              eq(industrialTasks.id, taskId),
              eq(industrialTasks.tenantId, tenantId),
              isNull(industrialTasks.archivedAt),
            ),
          )
          .limit(1);
        if (!task) throw new ForgeError("VALIDATION_FAILED", "Linked task not found");
      }
      if (categoryId) {
        const [cat] = await tx
          .select({ id: industrialCalendarCategories.id })
          .from(industrialCalendarCategories)
          .where(
            and(
              eq(industrialCalendarCategories.id, categoryId),
              eq(industrialCalendarCategories.tenantId, tenantId),
              isNull(industrialCalendarCategories.archivedAt),
            ),
          )
          .limit(1);
        if (!cat) throw new ForgeError("VALIDATION_FAILED", "Category not found");
      }

      const [row] = await tx
        .insert(industrialCalendarEvents)
        .values({
          id,
          tenantId,
          siteId,
          title,
          description,
          startsAt,
          endsAt,
          allDay,
          status: "SCHEDULED",
          categoryId,
          recurrenceRule,
          recurrenceUntil,
          recurrenceCount,
          seriesId: recurrenceRule ? id : null,
          taskId,
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (createDefaultReminder || offsets.length) {
        await this.insertReminderOffsets(tx, {
          tenantId,
          eventId: id,
          taskId,
          title,
          startsAt,
          offsets: offsets.length ? offsets : [15],
          userId: principal.userId,
          now,
        });
      }

      return row;
    });

    if (!created) throw new ForgeError("INTERNAL_ERROR", "Failed to create calendar event");
    return this.getEvent(principal, created.id);
  }

  async updateEvent(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const sourceId = String(id).includes(":") ? String(id).split(":")[0]! : id;
    const eventId = asOptionalUuid(sourceId);
    if (!eventId) throw new ForgeError("VALIDATION_FAILED", "Event id is required");
    const now = new Date();

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialCalendarEvents)
        .where(
          and(
            eq(industrialCalendarEvents.id, eventId),
            eq(industrialCalendarEvents.tenantId, tenantId),
            isNull(industrialCalendarEvents.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Calendar event not found");

      const patch: Partial<typeof industrialCalendarEvents.$inferInsert> = { updatedAt: now };
      if (body.title != null) patch.title = asRequiredString(body.title, "title");
      if (body.description !== undefined) {
        patch.description =
          body.description == null ? null : String(body.description).trim() || null;
      }
      if (body.startsAt != null || body.startAt != null) {
        patch.startsAt = asDate(body.startsAt ?? body.startAt, "startsAt");
      }
      if (body.endsAt != null || body.endAt != null) {
        patch.endsAt = asDate(body.endsAt ?? body.endAt, "endsAt");
      }
      if (body.allDay !== undefined) patch.allDay = Boolean(body.allDay);
      if (body.status != null) patch.status = asRequiredString(body.status, "status", 64);
      if (body.siteId !== undefined) patch.siteId = asOptionalUuid(body.siteId);
      if (body.categoryId !== undefined) {
        const categoryId = asOptionalUuid(body.categoryId);
        if (categoryId) {
          const [cat] = await tx
            .select({ id: industrialCalendarCategories.id })
            .from(industrialCalendarCategories)
            .where(
              and(
                eq(industrialCalendarCategories.id, categoryId),
                eq(industrialCalendarCategories.tenantId, tenantId),
                isNull(industrialCalendarCategories.archivedAt),
              ),
            )
            .limit(1);
          if (!cat) throw new ForgeError("VALIDATION_FAILED", "Category not found");
        }
        patch.categoryId = categoryId;
      }
      if (body.recurrenceRule !== undefined) {
        patch.recurrenceRule = asRecurrenceRule(body.recurrenceRule);
        patch.seriesId = patch.recurrenceRule ? (existing.seriesId ?? eventId) : null;
      }
      if (body.recurrenceUntil !== undefined) {
        patch.recurrenceUntil =
          body.recurrenceUntil == null || !String(body.recurrenceUntil).trim()
            ? null
            : asDate(body.recurrenceUntil, "recurrenceUntil");
      }
      if (body.recurrenceCount !== undefined) {
        if (body.recurrenceCount == null || String(body.recurrenceCount).trim() === "") {
          patch.recurrenceCount = null;
        } else {
          const n = Number(body.recurrenceCount);
          if (!Number.isFinite(n))
            throw new ForgeError("VALIDATION_FAILED", "recurrenceCount is invalid");
          patch.recurrenceCount = Math.max(1, Math.min(366, Math.round(n)));
        }
      }
      if (body.taskId !== undefined) {
        const taskId = asOptionalUuid(body.taskId);
        if (taskId) {
          const [task] = await tx
            .select({ id: industrialTasks.id })
            .from(industrialTasks)
            .where(
              and(
                eq(industrialTasks.id, taskId),
                eq(industrialTasks.tenantId, tenantId),
                isNull(industrialTasks.archivedAt),
              ),
            )
            .limit(1);
          if (!task) throw new ForgeError("VALIDATION_FAILED", "Linked task not found");
        }
        patch.taskId = taskId;
      }

      const startsAt = patch.startsAt ?? existing.startsAt;
      const endsAt = patch.endsAt ?? existing.endsAt;
      if (endsAt.getTime() < startsAt.getTime()) {
        throw new ForgeError("VALIDATION_FAILED", "endsAt must be on or after startsAt");
      }

      await tx
        .update(industrialCalendarEvents)
        .set(patch)
        .where(
          and(
            eq(industrialCalendarEvents.id, eventId),
            eq(industrialCalendarEvents.tenantId, tenantId),
          ),
        );

      const offsets = asReminderOffsets(body.reminderOffsetsMinutes);
      if (offsets.length) {
        await this.insertReminderOffsets(tx, {
          tenantId,
          eventId,
          taskId: (patch.taskId !== undefined ? patch.taskId : existing.taskId) ?? null,
          title: patch.title ?? existing.title,
          startsAt,
          offsets,
          userId: principal.userId,
          now,
        });
      }
    });

    return this.getEvent(principal, eventId);
  }

  async archiveEvent(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const sourceId = String(id).includes(":") ? String(id).split(":")[0]! : id;
    const eventId = asOptionalUuid(sourceId);
    if (!eventId) throw new ForgeError("VALIDATION_FAILED", "Event id is required");
    const now = new Date();

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: industrialCalendarEvents.id })
        .from(industrialCalendarEvents)
        .where(
          and(
            eq(industrialCalendarEvents.id, eventId),
            eq(industrialCalendarEvents.tenantId, tenantId),
            isNull(industrialCalendarEvents.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Calendar event not found");

      await tx
        .update(industrialCalendarEvents)
        .set({ archivedAt: now, updatedAt: now, status: "CANCELLED" })
        .where(
          and(
            eq(industrialCalendarEvents.id, eventId),
            eq(industrialCalendarEvents.tenantId, tenantId),
          ),
        );

      await tx
        .update(industrialReminders)
        .set({ status: "CANCELLED", updatedAt: now })
        .where(
          and(
            eq(industrialReminders.eventId, eventId),
            eq(industrialReminders.tenantId, tenantId),
            eq(industrialReminders.status, "PENDING"),
          ),
        );
    });

    return { id: eventId, archived: true };
  }

  async linkTask(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const sourceId = String(id).includes(":") ? String(id).split(":")[0]! : id;
    const eventId = asOptionalUuid(sourceId);
    if (!eventId) throw new ForgeError("VALIDATION_FAILED", "Event id is required");

    const event = await this.getEvent(principal, eventId);
    if (event.taskId) {
      return { event, task: { id: event.taskId }, linked: false };
    }

    const taskTitle =
      body.title != null && String(body.title).trim()
        ? asRequiredString(body.title, "title")
        : event.title;
    const deadlineDate = event.startsAt ? event.startsAt.slice(0, 10) : undefined;
    const created = (await this.domain.createTask(principal, {
      title: taskTitle,
      status: "assigned",
      deadlineDate,
      assigneePersonnelId: body.assigneePersonnelId ?? undefined,
      priority: body.priority ?? "Medium",
    })) as { id: string; title?: string };

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx
        .update(industrialCalendarEvents)
        .set({ taskId: created.id, updatedAt: new Date() })
        .where(
          and(
            eq(industrialCalendarEvents.id, eventId),
            eq(industrialCalendarEvents.tenantId, tenantId),
          ),
        );
    });

    const refreshed = await this.getEvent(principal, eventId);
    return { event: refreshed, task: created, linked: true };
  }

  async linksForTask(principal: ForgePrincipal, taskIdRaw: string) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    if (!taskId) throw new ForgeError("VALIDATION_FAILED", "taskId is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const events = await tx
        .select({
          id: industrialCalendarEvents.id,
          title: industrialCalendarEvents.title,
          startsAt: industrialCalendarEvents.startsAt,
        })
        .from(industrialCalendarEvents)
        .where(
          and(
            eq(industrialCalendarEvents.tenantId, tenantId),
            eq(industrialCalendarEvents.taskId, taskId),
            isNull(industrialCalendarEvents.archivedAt),
          ),
        )
        .limit(50);
      const reminders = await tx
        .select({
          id: industrialReminders.id,
          title: industrialReminders.title,
          remindAt: industrialReminders.remindAt,
          status: industrialReminders.status,
        })
        .from(industrialReminders)
        .where(
          and(
            eq(industrialReminders.tenantId, tenantId),
            eq(industrialReminders.taskId, taskId),
            isNull(industrialReminders.archivedAt),
          ),
        )
        .limit(50);
      return {
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          startsAt: e.startsAt?.toISOString() ?? null,
        })),
        reminders: reminders.map((r) => ({
          id: r.id,
          title: r.title,
          remindAt: r.remindAt?.toISOString() ?? null,
          status: r.status,
        })),
      };
    });
  }

  async upcoming(principal: ForgePrincipal, query: ListQuery) {
    const days = Math.max(1, Math.min(30, Number(query.days ?? 7) || 7));
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + days);

    const [eventsRes, remindersRes, tasks] = await Promise.all([
      this.listEvents(principal, { from: from.toISOString(), to: to.toISOString() }),
      this.listReminders(principal, { status: "PENDING" }),
      withTenantTransaction(this.db, this.tenant(principal), async (tx) => {
        return tx
          .select({
            id: industrialTasks.id,
            title: industrialTasks.title,
            dueDate: industrialTasks.dueDate,
            status: industrialTasks.status,
          })
          .from(industrialTasks)
          .where(
            and(
              eq(industrialTasks.tenantId, this.tenant(principal)),
              isNull(industrialTasks.archivedAt),
            ),
          )
          .limit(100);
      }),
    ]);

    const dueTasks = tasks
      .filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(`${t.dueDate}T23:59:59`);
        return d >= from && d <= to;
      })
      .map((t) => ({
        id: t.id,
        title: t.title || "Task",
        dueDate: t.dueDate,
        status: t.status,
        href: "/modules/tasks/",
      }));

    const pendingReminders = remindersRes.items
      .filter((r) => {
        if (!r.remindAt) return false;
        const d = new Date(r.remindAt);
        return d >= from && d <= to;
      })
      .slice(0, 20);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      events: eventsRes.items.slice(0, 20),
      tasks: dueTasks.slice(0, 20),
      reminders: pendingReminders,
    };
  }

  async listReminders(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    await this.processDueReminders(principal).catch((err) => {
      this.logger.warn(
        `Reminder sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    const status = query.status?.trim().toUpperCase() || null;
    const eventId = query.eventId ? asOptionalUuid(query.eventId) : null;
    const taskId = query.taskId ? asOptionalUuid(query.taskId) : null;

    const rows = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const conditions = [
        eq(industrialReminders.tenantId, tenantId),
        isNull(industrialReminders.archivedAt),
      ];
      if (status) conditions.push(eq(industrialReminders.status, status));
      if (eventId) conditions.push(eq(industrialReminders.eventId, eventId));
      if (taskId) conditions.push(eq(industrialReminders.taskId, taskId));

      return tx
        .select()
        .from(industrialReminders)
        .where(and(...conditions))
        .orderBy(asc(industrialReminders.remindAt))
        .limit(500);
    });

    return { items: rows.map(mapReminder) };
  }

  async createReminder(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const eventId = asOptionalUuid(body.eventId);
    const taskId = asOptionalUuid(body.taskId);
    if (!eventId && !taskId) {
      throw new ForgeError("VALIDATION_FAILED", "eventId or taskId is required");
    }
    const remindAt = asDate(body.remindAt, "remindAt");
    const channel = asChannel(body.channel);
    const title =
      body.title != null && String(body.title).trim()
        ? asRequiredString(body.title, "title")
        : null;
    const recipientUserIds = asRecipientUserIds(body.recipientUserIds, principal.userId);
    const now = new Date();
    const id = createId();

    const created = await withTenantTransaction(this.db, tenantId, async (tx) => {
      if (eventId) {
        const [event] = await tx
          .select({ id: industrialCalendarEvents.id })
          .from(industrialCalendarEvents)
          .where(
            and(
              eq(industrialCalendarEvents.id, eventId),
              eq(industrialCalendarEvents.tenantId, tenantId),
              isNull(industrialCalendarEvents.archivedAt),
            ),
          )
          .limit(1);
        if (!event) throw new ForgeError("VALIDATION_FAILED", "Linked event not found");
      }
      if (taskId) {
        const [task] = await tx
          .select({ id: industrialTasks.id })
          .from(industrialTasks)
          .where(
            and(
              eq(industrialTasks.id, taskId),
              eq(industrialTasks.tenantId, tenantId),
              isNull(industrialTasks.archivedAt),
            ),
          )
          .limit(1);
        if (!task) throw new ForgeError("VALIDATION_FAILED", "Linked task not found");
      }

      const [row] = await tx
        .insert(industrialReminders)
        .values({
          id,
          tenantId,
          eventId,
          taskId,
          title,
          remindAt,
          channel,
          status: "PENDING",
          recipientUserIds,
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });

    if (!created) throw new ForgeError("INTERNAL_ERROR", "Failed to create reminder");

    if (remindAt.getTime() <= Date.now()) {
      await this.processDueReminders(principal).catch(() => undefined);
      const [fresh] = await withTenantTransaction(this.db, tenantId, async (tx) => {
        return tx
          .select()
          .from(industrialReminders)
          .where(and(eq(industrialReminders.id, id), eq(industrialReminders.tenantId, tenantId)))
          .limit(1);
      });
      if (fresh) return mapReminder(fresh);
    }

    return mapReminder(created);
  }

  async updateReminder(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const reminderId = asOptionalUuid(id);
    if (!reminderId) throw new ForgeError("VALIDATION_FAILED", "Reminder id is required");
    const now = new Date();

    const updated = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialReminders)
        .where(
          and(
            eq(industrialReminders.id, reminderId),
            eq(industrialReminders.tenantId, tenantId),
            isNull(industrialReminders.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Reminder not found");
      if (existing.status === "SENT") {
        throw new ForgeError("VALIDATION_FAILED", "Sent reminders cannot be edited");
      }

      const patch: Partial<typeof industrialReminders.$inferInsert> = { updatedAt: now };
      if (body.title !== undefined) {
        patch.title =
          body.title == null || !String(body.title).trim()
            ? null
            : asRequiredString(body.title, "title");
      }
      if (body.remindAt != null) patch.remindAt = asDate(body.remindAt, "remindAt");
      if (body.channel != null) patch.channel = asChannel(body.channel);
      if (body.recipientUserIds !== undefined) {
        patch.recipientUserIds = asRecipientUserIds(body.recipientUserIds, principal.userId);
      }
      if (body.status != null) {
        const status = String(body.status).trim().toUpperCase();
        if (status !== "PENDING" && status !== "CANCELLED") {
          throw new ForgeError("VALIDATION_FAILED", "status must be PENDING or CANCELLED");
        }
        patch.status = status;
      }

      const [row] = await tx
        .update(industrialReminders)
        .set(patch)
        .where(
          and(eq(industrialReminders.id, reminderId), eq(industrialReminders.tenantId, tenantId)),
        )
        .returning();
      return row;
    });

    if (!updated) throw new ForgeError("INTERNAL_ERROR", "Failed to update reminder");
    return mapReminder(updated);
  }

  async cancelReminder(principal: ForgePrincipal, id: string) {
    return this.updateReminder(principal, id, { status: "CANCELLED" });
  }

  async processDueReminders(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const now = new Date();

    const due = await withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialReminders)
        .where(
          and(
            eq(industrialReminders.tenantId, tenantId),
            eq(industrialReminders.status, "PENDING"),
            isNull(industrialReminders.archivedAt),
            lte(industrialReminders.remindAt, now),
          ),
        )
        .orderBy(asc(industrialReminders.remindAt))
        .limit(100);
    });

    let sent = 0;
    for (const reminder of due) {
      const recipients = Array.isArray(reminder.recipientUserIds) ? reminder.recipientUserIds : [];
      const userIds = recipients.length
        ? recipients
        : reminder.createdByUserId
          ? [reminder.createdByUserId]
          : [];

      const title = (reminder.title || "Reminder").slice(0, 200);
      const href = reminder.eventId
        ? `/modules/calendar/`
        : reminder.taskId
          ? `/modules/tasks/`
          : `/modules/reminders/`;
      const body = `Due now: ${title}`;
      const channel = asChannel(reminder.channel);
      const destination = channel === "EMAIL" ? "EMAIL" : channel === "BOTH" ? "BOTH" : "IN_APP";

      for (const userId of userIds) {
        try {
          let emailTo: string | undefined;
          if (destination === "EMAIL" || destination === "BOTH") {
            const [user] = await withTenantTransaction(this.db, tenantId, async (tx) => {
              return tx
                .select({ email: users.primaryEmail })
                .from(users)
                .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
                .limit(1);
            });
            emailTo = user?.email?.trim().toLowerCase() || undefined;
          }

          await this.notifications.create(
            tenantId,
            {
              userId,
              type: "industrial.reminder.due",
              title,
              body,
              priority: "HIGH",
              destination:
                emailTo && (destination === "EMAIL" || destination === "BOTH")
                  ? destination
                  : "IN_APP",
              ...(emailTo && (destination === "EMAIL" || destination === "BOTH")
                ? { emailTo, emailTemplateKey: "system_notification" as const }
                : {}),
              href,
              metadataJson: {
                reminderId: reminder.id,
                eventId: reminder.eventId,
                taskId: reminder.taskId,
              },
            },
            principal,
          );
        } catch (err) {
          this.logger.warn(
            `Failed to notify ${userId} for reminder ${reminder.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      await withTenantTransaction(this.db, tenantId, async (tx) => {
        await tx
          .update(industrialReminders)
          .set({ status: "SENT", sentAt: now, updatedAt: now })
          .where(
            and(
              eq(industrialReminders.id, reminder.id),
              eq(industrialReminders.tenantId, tenantId),
              eq(industrialReminders.status, "PENDING"),
            ),
          );
      });
      sent += 1;
    }

    return { processed: due.length, sent };
  }
}
