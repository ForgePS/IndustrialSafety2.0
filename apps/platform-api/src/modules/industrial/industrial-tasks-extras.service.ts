import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialCalendarEvents,
  industrialPersonnel,
  industrialReminders,
  industrialTaskActivity,
  industrialTaskChecklistItems,
  industrialTasks,
  industrialTaskSubtasks,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";

type ListQuery = Record<string, string | undefined>;

/** Accept RFC 4122/9562 UUIDs including Forge createId() UUIDv7 values. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function mapItem(row: {
  id: string;
  title: string;
  isDone: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    title: row.title,
    isDone: Boolean(row.isDone),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class IndustrialTasksExtrasService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly domain: IndustrialDomainService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  async recordActivity(
    principal: ForgePrincipal,
    taskId: string,
    action: string,
    detail: Record<string, unknown> = {},
  ) {
    const tenantId = this.tenant(principal);
    const id = asOptionalUuid(taskId);
    if (!id) return;
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx.insert(industrialTaskActivity).values({
        id: createId(),
        tenantId,
        taskId: id,
        actorUserId: principal.userId,
        action,
        detailJson: detail,
        createdAt: new Date(),
      });
    });
  }

  private async assertTask(tenantId: string, taskId: string) {
    const [task] = await withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select({ id: industrialTasks.id, title: industrialTasks.title, dueDate: industrialTasks.dueDate })
        .from(industrialTasks)
        .where(
          and(
            eq(industrialTasks.id, taskId),
            eq(industrialTasks.tenantId, tenantId),
            isNull(industrialTasks.archivedAt),
          ),
        )
        .limit(1);
    });
    if (!task) throw new ForgeError("NOT_FOUND", "Task not found");
    return task;
  }

  async listTasksEnriched(principal: ForgePrincipal, query: ListQuery) {
    const page = (await this.domain.listModule(principal, "tasks", query)) as {
      page: number;
      pageSize: number;
      items: Array<Record<string, unknown>>;
    };

    const tenantId = this.tenant(principal);
    const taskIds = page.items.map((i) => String(i.id ?? "")).filter(Boolean);
    const { map: enrichment, myPersonnelId } = await this.loadEnrichment(
      tenantId,
      taskIds,
      principal,
    );

    let items: Array<Record<string, unknown>> = page.items.map((item) => {
      const id = String(item.id);
      const extra = enrichment.get(id) ?? {
        subtaskProgress: { done: 0, total: 0 },
        checklistProgress: { done: 0, total: 0 },
        reminderCount: 0,
        linkedEventCount: 0,
      };
      return { ...item, ...extra, overdue: Boolean(item.overdue) || this.isOverdue(item) };
    });

    const view = String(query.view ?? "").toLowerCase();
    if (view === "mine" || query.mine === "1") {
      items = items.filter((i) => String(i.createdByUserId ?? "") === principal.userId);
    } else if (view === "assigned" || query.assignedToMe === "1") {
      items = myPersonnelId
        ? items.filter((i) => String(i.assigneePersonnelId ?? "") === myPersonnelId)
        : [];
    } else if (view === "overdue" || query.overdue === "1") {
      items = items.filter((i) => Boolean(i.overdue));
    } else if (view === "completed") {
      items = items.filter((i) => {
        const s = String(i.status ?? "").toLowerCase();
        return s === "completed" || s === "complete";
      });
    }

    // Default / filtered active views hide completed unless view=all|completed
    if (view !== "all" && view !== "completed") {
      items = items.filter((i) => {
        const s = String(i.status ?? "").toLowerCase();
        return s !== "completed" && s !== "complete" && s !== "cancelled" && s !== "archived";
      });
    }

    return { ...page, items };
  }

  private isOverdue(item: Record<string, unknown>): boolean {
    const due = String(item.deadlineDate ?? item.dueDate ?? "").trim();
    if (!due) return false;
    const s = String(item.status ?? "").toLowerCase();
    if (s === "completed" || s === "complete" || s === "cancelled") return false;
    const end = new Date(`${due.slice(0, 10)}T23:59:59`);
    return end.getTime() < Date.now();
  }

  private async loadEnrichment(tenantId: string, taskIds: string[], principal: ForgePrincipal) {
    let myPersonnelId: string | null = null;
    const map = new Map<
      string,
      {
        subtaskProgress: { done: number; total: number };
        checklistProgress: { done: number; total: number };
        reminderCount: number;
        linkedEventCount: number;
      }
    >();

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [person] = await tx
        .select({ id: industrialPersonnel.id })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            eq(industrialPersonnel.userAuthId, principal.userId),
            isNull(industrialPersonnel.archivedAt),
          ),
        )
        .limit(1);
      myPersonnelId = person?.id ?? null;

      if (!taskIds.length) return;

      const subtasks = await tx
        .select({
          taskId: industrialTaskSubtasks.taskId,
          isDone: industrialTaskSubtasks.isDone,
        })
        .from(industrialTaskSubtasks)
        .where(
          and(
            eq(industrialTaskSubtasks.tenantId, tenantId),
            inArray(industrialTaskSubtasks.taskId, taskIds),
            isNull(industrialTaskSubtasks.archivedAt),
          ),
        );
      const checklist = await tx
        .select({
          taskId: industrialTaskChecklistItems.taskId,
          isDone: industrialTaskChecklistItems.isDone,
        })
        .from(industrialTaskChecklistItems)
        .where(
          and(
            eq(industrialTaskChecklistItems.tenantId, tenantId),
            inArray(industrialTaskChecklistItems.taskId, taskIds),
            isNull(industrialTaskChecklistItems.archivedAt),
          ),
        );
      const reminders = await tx
        .select({
          taskId: industrialReminders.taskId,
        })
        .from(industrialReminders)
        .where(
          and(
            eq(industrialReminders.tenantId, tenantId),
            inArray(industrialReminders.taskId, taskIds),
            isNull(industrialReminders.archivedAt),
          ),
        );
      const events = await tx
        .select({
          taskId: industrialCalendarEvents.taskId,
        })
        .from(industrialCalendarEvents)
        .where(
          and(
            eq(industrialCalendarEvents.tenantId, tenantId),
            inArray(industrialCalendarEvents.taskId, taskIds),
            isNull(industrialCalendarEvents.archivedAt),
          ),
        );

      for (const id of taskIds) {
        map.set(id, {
          subtaskProgress: { done: 0, total: 0 },
          checklistProgress: { done: 0, total: 0 },
          reminderCount: 0,
          linkedEventCount: 0,
        });
      }
      for (const row of subtasks) {
        const e = map.get(row.taskId);
        if (!e) continue;
        e.subtaskProgress.total += 1;
        if (row.isDone) e.subtaskProgress.done += 1;
      }
      for (const row of checklist) {
        const e = map.get(row.taskId);
        if (!e) continue;
        e.checklistProgress.total += 1;
        if (row.isDone) e.checklistProgress.done += 1;
      }
      for (const row of reminders) {
        if (!row.taskId) continue;
        const e = map.get(row.taskId);
        if (e) e.reminderCount += 1;
      }
      for (const row of events) {
        if (!row.taskId) continue;
        const e = map.get(row.taskId);
        if (e) e.linkedEventCount += 1;
      }
    });

    return { map, myPersonnelId };
  }

  async listSubtasks(principal: ForgePrincipal, taskIdRaw: string) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    if (!taskId) throw new ForgeError("VALIDATION_FAILED", "Task id is required");
    await this.assertTask(tenantId, taskId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialTaskSubtasks)
        .where(
          and(
            eq(industrialTaskSubtasks.tenantId, tenantId),
            eq(industrialTaskSubtasks.taskId, taskId),
            isNull(industrialTaskSubtasks.archivedAt),
          ),
        )
        .orderBy(asc(industrialTaskSubtasks.sortOrder), asc(industrialTaskSubtasks.createdAt));
    });
    return { items: rows.map(mapItem) };
  }

  async createSubtask(principal: ForgePrincipal, taskIdRaw: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    if (!taskId) throw new ForgeError("VALIDATION_FAILED", "Task id is required");
    await this.assertTask(tenantId, taskId);
    const title = asRequiredString(body.title, "title");
    const now = new Date();
    const id = createId();
    const created = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [agg] = await tx
        .select({ max: sql<number>`coalesce(max(${industrialTaskSubtasks.sortOrder}), -1)` })
        .from(industrialTaskSubtasks)
        .where(
          and(eq(industrialTaskSubtasks.tenantId, tenantId), eq(industrialTaskSubtasks.taskId, taskId)),
        );
      const [row] = await tx
        .insert(industrialTaskSubtasks)
        .values({
          id,
          tenantId,
          taskId,
          title,
          isDone: false,
          sortOrder: Number(agg?.max ?? -1) + 1,
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
    if (!created) throw new ForgeError("INTERNAL_ERROR", "Failed to create subtask");
    await this.recordActivity(principal, taskId, "subtask.created", { subtaskId: id, title });
    return mapItem(created);
  }

  async updateSubtask(
    principal: ForgePrincipal,
    taskIdRaw: string,
    subIdRaw: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    const subId = asOptionalUuid(subIdRaw);
    if (!taskId || !subId) throw new ForgeError("VALIDATION_FAILED", "Ids required");
    const now = new Date();
    const updated = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialTaskSubtasks)
        .where(
          and(
            eq(industrialTaskSubtasks.id, subId),
            eq(industrialTaskSubtasks.taskId, taskId),
            eq(industrialTaskSubtasks.tenantId, tenantId),
            isNull(industrialTaskSubtasks.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Subtask not found");
      const patch: Partial<typeof industrialTaskSubtasks.$inferInsert> = { updatedAt: now };
      if (body.title != null) patch.title = asRequiredString(body.title, "title");
      if (body.isDone !== undefined) patch.isDone = Boolean(body.isDone);
      if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) {
        patch.sortOrder = Number(body.sortOrder);
      }
      const [row] = await tx
        .update(industrialTaskSubtasks)
        .set(patch)
        .where(and(eq(industrialTaskSubtasks.id, subId), eq(industrialTaskSubtasks.tenantId, tenantId)))
        .returning();
      return row;
    });
    if (!updated) throw new ForgeError("INTERNAL_ERROR", "Failed to update subtask");
    if (body.isDone !== undefined) {
      await this.recordActivity(principal, taskId, body.isDone ? "subtask.done" : "subtask.undone", {
        subtaskId: subId,
      });
    }
    return mapItem(updated);
  }

  async archiveSubtask(principal: ForgePrincipal, taskIdRaw: string, subIdRaw: string) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    const subId = asOptionalUuid(subIdRaw);
    if (!taskId || !subId) throw new ForgeError("VALIDATION_FAILED", "Ids required");
    const now = new Date();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: industrialTaskSubtasks.id })
        .from(industrialTaskSubtasks)
        .where(
          and(
            eq(industrialTaskSubtasks.id, subId),
            eq(industrialTaskSubtasks.taskId, taskId),
            eq(industrialTaskSubtasks.tenantId, tenantId),
            isNull(industrialTaskSubtasks.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Subtask not found");
      await tx
        .update(industrialTaskSubtasks)
        .set({ archivedAt: now, updatedAt: now })
        .where(and(eq(industrialTaskSubtasks.id, subId), eq(industrialTaskSubtasks.tenantId, tenantId)));
    });
    await this.recordActivity(principal, taskId, "subtask.archived", { subtaskId: subId });
    return { id: subId, archived: true };
  }

  async listChecklist(principal: ForgePrincipal, taskIdRaw: string) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    if (!taskId) throw new ForgeError("VALIDATION_FAILED", "Task id is required");
    await this.assertTask(tenantId, taskId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialTaskChecklistItems)
        .where(
          and(
            eq(industrialTaskChecklistItems.tenantId, tenantId),
            eq(industrialTaskChecklistItems.taskId, taskId),
            isNull(industrialTaskChecklistItems.archivedAt),
          ),
        )
        .orderBy(asc(industrialTaskChecklistItems.sortOrder), asc(industrialTaskChecklistItems.createdAt));
    });
    return { items: rows.map(mapItem) };
  }

  async createChecklistItem(principal: ForgePrincipal, taskIdRaw: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    if (!taskId) throw new ForgeError("VALIDATION_FAILED", "Task id is required");
    await this.assertTask(tenantId, taskId);
    const title = asRequiredString(body.title ?? body.text, "title");
    const now = new Date();
    const id = createId();
    const created = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [agg] = await tx
        .select({
          max: sql<number>`coalesce(max(${industrialTaskChecklistItems.sortOrder}), -1)`,
        })
        .from(industrialTaskChecklistItems)
        .where(
          and(
            eq(industrialTaskChecklistItems.tenantId, tenantId),
            eq(industrialTaskChecklistItems.taskId, taskId),
          ),
        );
      const [row] = await tx
        .insert(industrialTaskChecklistItems)
        .values({
          id,
          tenantId,
          taskId,
          title,
          isDone: false,
          sortOrder: Number(agg?.max ?? -1) + 1,
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
    if (!created) throw new ForgeError("INTERNAL_ERROR", "Failed to create checklist item");
    await this.recordActivity(principal, taskId, "checklist.created", { itemId: id, title });
    return mapItem(created);
  }

  async updateChecklistItem(
    principal: ForgePrincipal,
    taskIdRaw: string,
    itemIdRaw: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    const itemId = asOptionalUuid(itemIdRaw);
    if (!taskId || !itemId) throw new ForgeError("VALIDATION_FAILED", "Ids required");
    const now = new Date();
    const updated = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialTaskChecklistItems)
        .where(
          and(
            eq(industrialTaskChecklistItems.id, itemId),
            eq(industrialTaskChecklistItems.taskId, taskId),
            eq(industrialTaskChecklistItems.tenantId, tenantId),
            isNull(industrialTaskChecklistItems.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Checklist item not found");
      const patch: Partial<typeof industrialTaskChecklistItems.$inferInsert> = { updatedAt: now };
      if (body.title != null || body.text != null) {
        patch.title = asRequiredString(body.title ?? body.text, "title");
      }
      if (body.isDone !== undefined) patch.isDone = Boolean(body.isDone);
      if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) {
        patch.sortOrder = Number(body.sortOrder);
      }
      const [row] = await tx
        .update(industrialTaskChecklistItems)
        .set(patch)
        .where(
          and(
            eq(industrialTaskChecklistItems.id, itemId),
            eq(industrialTaskChecklistItems.tenantId, tenantId),
          ),
        )
        .returning();
      return row;
    });
    if (!updated) throw new ForgeError("INTERNAL_ERROR", "Failed to update checklist item");
    if (body.isDone !== undefined) {
      await this.recordActivity(principal, taskId, body.isDone ? "checklist.done" : "checklist.undone", {
        itemId,
      });
    }
    return mapItem(updated);
  }

  async archiveChecklistItem(principal: ForgePrincipal, taskIdRaw: string, itemIdRaw: string) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    const itemId = asOptionalUuid(itemIdRaw);
    if (!taskId || !itemId) throw new ForgeError("VALIDATION_FAILED", "Ids required");
    const now = new Date();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: industrialTaskChecklistItems.id })
        .from(industrialTaskChecklistItems)
        .where(
          and(
            eq(industrialTaskChecklistItems.id, itemId),
            eq(industrialTaskChecklistItems.taskId, taskId),
            eq(industrialTaskChecklistItems.tenantId, tenantId),
            isNull(industrialTaskChecklistItems.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Checklist item not found");
      await tx
        .update(industrialTaskChecklistItems)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(industrialTaskChecklistItems.id, itemId),
            eq(industrialTaskChecklistItems.tenantId, tenantId),
          ),
        );
    });
    await this.recordActivity(principal, taskId, "checklist.archived", { itemId });
    return { id: itemId, archived: true };
  }

  async listActivity(principal: ForgePrincipal, taskIdRaw: string) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    if (!taskId) throw new ForgeError("VALIDATION_FAILED", "Task id is required");
    await this.assertTask(tenantId, taskId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialTaskActivity)
        .where(
          and(eq(industrialTaskActivity.tenantId, tenantId), eq(industrialTaskActivity.taskId, taskId)),
        )
        .orderBy(desc(industrialTaskActivity.createdAt))
        .limit(100);
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        detail: r.detailJson ?? {},
        actorUserId: r.actorUserId,
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
    };
  }

  async createTaskReminders(principal: ForgePrincipal, taskIdRaw: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const taskId = asOptionalUuid(taskIdRaw);
    if (!taskId) throw new ForgeError("VALIDATION_FAILED", "Task id is required");
    const task = await this.assertTask(tenantId, taskId);
    const offsets = Array.isArray(body.offsetsMinutes)
      ? body.offsetsMinutes
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n >= 0)
          .map((n) => Math.round(n))
      : [15, 60, 1440];
    const unique = [...new Set(offsets)].slice(0, 10);
    if (!unique.length) throw new ForgeError("VALIDATION_FAILED", "offsetsMinutes required");

    const base =
      task.dueDate != null
        ? new Date(`${String(task.dueDate).slice(0, 10)}T17:00:00`)
        : new Date(Date.now() + 60 * 60 * 1000);
    const now = new Date();
    const created = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = [];
      for (const minutes of unique) {
        const id = createId();
        const [row] = await tx
          .insert(industrialReminders)
          .values({
            id,
            tenantId,
            eventId: null,
            taskId,
            title: `Reminder: ${task.title || "Task"}`,
            remindAt: new Date(base.getTime() - minutes * 60 * 1000),
            channel: "IN_APP",
            status: "PENDING",
            recipientUserIds: [principal.userId],
            createdByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (row) rows.push(row);
      }
      return rows;
    });

    await this.recordActivity(principal, taskId, "reminder.created", { count: created.length, offsets: unique });
    return {
      items: created.map((r) => ({
        id: r.id,
        remindAt: r.remindAt?.toISOString() ?? null,
        title: r.title,
        status: r.status,
      })),
    };
  }

  async getTaskDetail(principal: ForgePrincipal, taskIdRaw: string) {
    const taskId = asOptionalUuid(taskIdRaw);
    if (!taskId) throw new ForgeError("VALIDATION_FAILED", "Task id is required");
    const [subtasks, checklist, activity] = await Promise.all([
      this.listSubtasks(principal, taskId),
      this.listChecklist(principal, taskId),
      this.listActivity(principal, taskId),
    ]);
    return { taskId, subtasks: subtasks.items, checklist: checklist.items, activity: activity.items };
  }
}
