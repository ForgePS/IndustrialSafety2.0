import { Inject, Injectable } from "@nestjs/common";
import {
  industrialCorrectiveActions,
  industrialPersonnel,
  industrialSites,
  industrialTasks,
  industrialTrainingAssignmentAssignees,
  industrialTrainingAssignments,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";

export type FieldWorkKind = "training" | "corrective_action" | "task";

export type FieldWorkItem = {
  kind: FieldWorkKind;
  id: string;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  priority: string | null;
  status: string;
  estimatedMinutes: number | null;
  href: string;
  locationId: string | null;
  locationName: string | null;
  divisionName: string | null;
  departmentName: string | null;
};

export type FieldMyWorkResult = {
  items: FieldWorkItem[];
  counts: {
    totalOpen: number;
    overdue: number;
    dueToday: number;
    dueNow: number;
    training: number;
    correctiveActions: number;
    tasks: number;
  };
  personnelId: string | null;
};

function startOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function toIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T23:59:59.000Z`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return text;
}

function classifyDue(
  dueAt: string | null,
  now: Date,
): "overdue" | "dueNow" | "dueToday" | "upcoming" | "none" {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  if (due.getTime() < now.getTime()) return "overdue";
  const sod = startOfLocalDay(now).getTime();
  const eod = endOfLocalDay(now).getTime();
  const t = due.getTime();
  if (t <= now.getTime() + 2 * 60 * 60 * 1000) return "dueNow";
  if (t >= sod && t <= eod) return "dueToday";
  return "upcoming";
}

@Injectable()
export class IndustrialMyWorkService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listMyWork(principal: ForgePrincipal): Promise<FieldMyWorkResult> {
    const now = new Date();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [personnel] = await tx
        .select({
          id: industrialPersonnel.id,
          employeeNumber: industrialPersonnel.employeeNumber,
          displayName: industrialPersonnel.displayName,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, principal.tenantId),
            eq(industrialPersonnel.userAuthId, principal.userId),
            isNull(industrialPersonnel.archivedAt),
          ),
        )
        .limit(1);

      const personnelId = personnel?.id ?? null;
      const employeeNumber = personnel?.employeeNumber?.trim() || null;
      const items: FieldWorkItem[] = [];

      if (personnelId) {
        const siteNameById = new Map<string, string>();
        const siteRows = await tx
          .select({ id: industrialSites.id, name: industrialSites.name })
          .from(industrialSites)
          .where(
            and(
              eq(industrialSites.tenantId, principal.tenantId),
              isNull(industrialSites.archivedAt),
            ),
          );
        for (const site of siteRows) {
          siteNameById.set(site.id, site.name);
        }

        const cas = await tx
          .select({
            id: industrialCorrectiveActions.id,
            title: industrialCorrectiveActions.title,
            status: industrialCorrectiveActions.status,
            priority: industrialCorrectiveActions.priority,
            dueDate: industrialCorrectiveActions.dueDate,
            parentEntityType: industrialCorrectiveActions.parentEntityType,
            ownerName: industrialCorrectiveActions.ownerName,
            siteId: industrialCorrectiveActions.siteId,
          })
          .from(industrialCorrectiveActions)
          .where(
            and(
              eq(industrialCorrectiveActions.tenantId, principal.tenantId),
              eq(industrialCorrectiveActions.assignedPersonnelId, personnelId),
              isNull(industrialCorrectiveActions.archivedAt),
              ne(industrialCorrectiveActions.status, "COMPLETED"),
            ),
          )
          .orderBy(desc(industrialCorrectiveActions.dueDate))
          .limit(100);

        for (const row of cas) {
          const locationId = row.siteId ?? null;
          items.push({
            kind: "corrective_action",
            id: row.id,
            title: row.title,
            subtitle: row.parentEntityType ? `Related: ${row.parentEntityType}` : row.ownerName,
            dueAt: toIsoDate(row.dueDate),
            priority: row.priority ?? "MEDIUM",
            status: row.status,
            estimatedMinutes: 10,
            href: `/corrective/${encodeURIComponent(row.id)}/`,
            locationId,
            locationName: locationId ? (siteNameById.get(locationId) ?? null) : null,
            divisionName: null,
            departmentName: null,
          });
        }

        const tasks = await tx
          .select({
            id: industrialTasks.id,
            title: industrialTasks.title,
            status: industrialTasks.status,
            dueDate: industrialTasks.dueDate,
            sourcePayload: industrialTasks.sourcePayload,
            siteId: industrialTasks.siteId,
          })
          .from(industrialTasks)
          .where(
            and(
              eq(industrialTasks.tenantId, principal.tenantId),
              eq(industrialTasks.assigneePersonnelId, personnelId),
              isNull(industrialTasks.archivedAt),
              isNull(industrialTasks.completedAt),
              ne(industrialTasks.status, "COMPLETED"),
            ),
          )
          .orderBy(desc(industrialTasks.dueDate))
          .limit(100);

        for (const row of tasks) {
          const payload =
            row.sourcePayload && typeof row.sourcePayload === "object"
              ? (row.sourcePayload as Record<string, unknown>)
              : {};
          const priority = typeof payload.priority === "string" ? payload.priority : null;
          const locationId =
            row.siteId ?? (typeof payload.siteId === "string" ? payload.siteId : null);
          const locationName =
            (locationId ? siteNameById.get(locationId) : null) ??
            (typeof payload.locationName === "string" ? payload.locationName : null);
          const divisionName =
            typeof payload.divisionName === "string" ? payload.divisionName : null;
          const departmentName =
            typeof payload.departmentName === "string" ? payload.departmentName : null;
          items.push({
            kind: "task",
            id: row.id,
            title: row.title?.trim() || "Assigned task",
            subtitle: null,
            dueAt: toIsoDate(row.dueDate ?? payload.deadlineDate),
            priority,
            status: row.status,
            estimatedMinutes: 5,
            href: `/tasks/item/${encodeURIComponent(row.id)}/`,
            locationId,
            locationName,
            divisionName,
            departmentName,
          });
        }
      }

      if (employeeNumber) {
        const mine = await tx
          .select({ assignmentId: industrialTrainingAssignmentAssignees.assignmentId })
          .from(industrialTrainingAssignmentAssignees)
          .where(
            and(
              eq(industrialTrainingAssignmentAssignees.tenantId, principal.tenantId),
              sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${employeeNumber})`,
            ),
          );
        const ids = [...new Set(mine.map((m) => m.assignmentId))];
        if (ids.length) {
          const rows = await tx
            .select({
              id: industrialTrainingAssignments.id,
              title: industrialTrainingAssignments.title,
              dueAt: industrialTrainingAssignments.dueAt,
              status: industrialTrainingAssignments.status,
            })
            .from(industrialTrainingAssignments)
            .where(
              and(
                eq(industrialTrainingAssignments.tenantId, principal.tenantId),
                inArray(industrialTrainingAssignments.id, ids),
                isNull(industrialTrainingAssignments.archivedAt),
                eq(industrialTrainingAssignments.status, "ACTIVE"),
              ),
            )
            .orderBy(desc(industrialTrainingAssignments.dueAt))
            .limit(100);

          const assigneeRows = await tx
            .select({
              assignmentId: industrialTrainingAssignmentAssignees.assignmentId,
              status: industrialTrainingAssignmentAssignees.status,
            })
            .from(industrialTrainingAssignmentAssignees)
            .where(
              and(
                eq(industrialTrainingAssignmentAssignees.tenantId, principal.tenantId),
                inArray(industrialTrainingAssignmentAssignees.assignmentId, ids),
                sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${employeeNumber})`,
              ),
            );
          const myStatus = new Map(
            assigneeRows.map((r) => [r.assignmentId, String(r.status ?? "NOT_STARTED")]),
          );

          for (const row of rows) {
            const status = myStatus.get(row.id) ?? "NOT_STARTED";
            if (status === "PASSED") continue;
            items.push({
              kind: "training",
              id: row.id,
              title: row.title,
              subtitle: "Training assignment",
              dueAt: toIsoDate(row.dueAt),
              priority: null,
              status,
              estimatedMinutes: 15,
              href: `/training/${encodeURIComponent(row.id)}/`,
              locationId: null,
              locationName: null,
              divisionName: null,
              departmentName: null,
            });
          }
        }
      }

      items.sort((a, b) => {
        const rank = (item: FieldWorkItem) => {
          const bucket = classifyDue(item.dueAt, now);
          if (bucket === "overdue") return 0;
          if (bucket === "dueNow") return 1;
          if (bucket === "dueToday") return 2;
          if (bucket === "upcoming") return 3;
          return 4;
        };
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const da = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const db = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
        return da - db;
      });

      let overdue = 0;
      let dueNow = 0;
      let dueToday = 0;
      let training = 0;
      let correctiveActions = 0;
      let tasksCount = 0;
      for (const item of items) {
        const bucket = classifyDue(item.dueAt, now);
        if (bucket === "overdue") overdue += 1;
        if (bucket === "dueNow") dueNow += 1;
        if (bucket === "overdue" || bucket === "dueNow" || bucket === "dueToday") dueToday += 1;
        if (item.kind === "training") training += 1;
        if (item.kind === "corrective_action") correctiveActions += 1;
        if (item.kind === "task") tasksCount += 1;
      }

      return {
        items,
        counts: {
          totalOpen: items.length,
          overdue,
          dueToday,
          dueNow,
          training,
          correctiveActions,
          tasks: tasksCount,
        },
        personnelId,
      };
    });
  }
}
