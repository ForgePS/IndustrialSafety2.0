import {
  industrialDepartments,
  industrialEmergencyAlertGroupMembers,
  industrialEmergencyAlertGroups,
  industrialPersonnel,
  industrialSites,
  type DatabaseTransaction,
  users,
} from "@forge/database";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

export type AlertAudience = {
  scope: "TENANT" | "TARGETED";
  locationIds: string[];
  departmentIds: string[];
  groupIds: string[];
  personnelIds: string[];
};

export type ResolvedRecipient = {
  personnelId: string;
  userId: string | null;
  displayName: string;
  recipientType: "EMPLOYEE" | "CONTRACTOR";
  locationId: string | null;
  departmentId: string | null;
  phoneNumberSnapshot: string | null;
  smsEligible: boolean;
  exclusionReason: string | null;
};

export type AudiencePreview = {
  audience: AlertAudience;
  employees: number;
  contractors: number;
  totalPersonnel: number;
  uniqueSmsNumbers: number;
  smsEligible: number;
  forgeUsers: number;
  excluded: number;
  exclusions: { reason: string; count: number }[];
  mvixLocations: number;
  sample: Array<{
    personnelId: string;
    displayName: string;
    smsEligible: boolean;
    exclusionReason: string | null;
  }>;
};

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const id = String(item ?? "").trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function parseAudience(raw: unknown): AlertAudience {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const locationIds = asIdList(obj.locationIds ?? obj.location_ids);
  const departmentIds = asIdList(obj.departmentIds ?? obj.department_ids);
  const groupIds = asIdList(obj.groupIds ?? obj.group_ids);
  const personnelIds = asIdList(obj.personnelIds ?? obj.personnel_ids);
  const scopeRaw = String(obj.scope ?? "").toUpperCase();
  const targeted =
    scopeRaw === "TARGETED" ||
    locationIds.length > 0 ||
    departmentIds.length > 0 ||
    groupIds.length > 0 ||
    personnelIds.length > 0;
  return {
    scope: targeted ? "TARGETED" : "TENANT",
    locationIds,
    departmentIds,
    groupIds,
    personnelIds,
  };
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function pickSmsNotificationPhone(phone?: string | null): {
  snapshot: string | null;
  eligible: boolean;
  reason: string | null;
} {
  const raw = (phone ?? "").trim();
  if (!raw) return { snapshot: null, eligible: false, reason: "NO_MOBILE_NUMBER" };
  const normalized = normalizePhone(raw);
  if (!normalized) return { snapshot: raw.slice(0, 32), eligible: false, reason: "INVALID_PHONE" };
  return { snapshot: normalized.slice(0, 32), eligible: true, reason: null };
}

async function resolveGroupPersonnelIds(
  tx: DatabaseTransaction,
  tenantId: string,
  groupIds: string[],
): Promise<string[]> {
  if (!groupIds.length) return [];
  const groups = await tx
    .select()
    .from(industrialEmergencyAlertGroups)
    .where(
      and(
        eq(industrialEmergencyAlertGroups.tenantId, tenantId),
        inArray(industrialEmergencyAlertGroups.id, groupIds),
        eq(industrialEmergencyAlertGroups.enabled, true),
      ),
    );

  const ids = new Set<string>();
  const now = Date.now();

  for (const group of groups) {
    if (group.expiresAt && group.expiresAt.getTime() < now) continue;

    if (group.dynamic || group.groupType === "DYNAMIC") {
      const rules =
        group.ruleJson && typeof group.ruleJson === "object"
          ? (group.ruleJson as Record<string, unknown>)
          : {};
      const ruleLocationIds = asIdList(rules.locationIds ?? rules.location_ids);
      if (group.locationId) ruleLocationIds.push(group.locationId);
      const ruleDepartmentIds = asIdList(rules.departmentIds ?? rules.department_ids);
      if (group.departmentId) ruleDepartmentIds.push(group.departmentId);

      const conditions = [
        eq(industrialPersonnel.tenantId, tenantId),
        eq(industrialPersonnel.status, "ACTIVE"),
        isNull(industrialPersonnel.archivedAt),
      ];
      if (ruleLocationIds.length) {
        conditions.push(inArray(industrialPersonnel.siteId, ruleLocationIds));
      }
      if (ruleDepartmentIds.length) {
        conditions.push(inArray(industrialPersonnel.departmentId, ruleDepartmentIds));
      }

      const rows = await tx
        .select({ id: industrialPersonnel.id })
        .from(industrialPersonnel)
        .where(and(...conditions));
      for (const row of rows) ids.add(row.id);
      continue;
    }

    const members = await tx
      .select({ personnelId: industrialEmergencyAlertGroupMembers.personnelId })
      .from(industrialEmergencyAlertGroupMembers)
      .where(
        and(
          eq(industrialEmergencyAlertGroupMembers.tenantId, tenantId),
          eq(industrialEmergencyAlertGroupMembers.groupId, group.id),
        ),
      );
    for (const m of members) ids.add(m.personnelId);
  }

  return [...ids];
}

/**
 * Resolve deduplicated personnel recipients for an alert audience.
 * Server-side only — never trust client counts for authorization.
 */
export async function resolveAudienceRecipients(
  tx: DatabaseTransaction,
  tenantId: string,
  audienceInput: unknown,
): Promise<{ audience: AlertAudience; recipients: ResolvedRecipient[] }> {
  const audience = parseAudience(audienceInput);
  const groupPersonnelIds = await resolveGroupPersonnelIds(tx, tenantId, audience.groupIds);

  const conditions = [
    eq(industrialPersonnel.tenantId, tenantId),
    isNull(industrialPersonnel.archivedAt),
  ];

  if (audience.scope === "TARGETED") {
    const clauses = [];
    if (audience.locationIds.length) {
      clauses.push(inArray(industrialPersonnel.siteId, audience.locationIds));
    }
    if (audience.departmentIds.length) {
      clauses.push(inArray(industrialPersonnel.departmentId, audience.departmentIds));
    }
    if (groupPersonnelIds.length) {
      clauses.push(inArray(industrialPersonnel.id, groupPersonnelIds));
    }
    if (audience.personnelIds.length) {
      clauses.push(inArray(industrialPersonnel.id, audience.personnelIds));
    }
    if (!clauses.length) {
      return { audience, recipients: [] };
    }
    conditions.push(or(...clauses)!);
  }

  const rows = await tx
    .select({
      id: industrialPersonnel.id,
      displayName: industrialPersonnel.displayName,
      status: industrialPersonnel.status,
      siteId: industrialPersonnel.siteId,
      departmentId: industrialPersonnel.departmentId,
      phone: industrialPersonnel.phone,
      companyPhone: industrialPersonnel.companyPhone,
      smsAuthorizedAt: industrialPersonnel.smsAuthorizedAt,
      smsOptedOutAt: industrialPersonnel.smsOptedOutAt,
      userAuthId: industrialPersonnel.userAuthId,
      email: industrialPersonnel.email,
      companyEmail: industrialPersonnel.companyEmail,
    })
    .from(industrialPersonnel)
    .where(and(...conditions))
    .limit(5000);

  const authIds = rows
    .map((r) => String(r.userAuthId ?? "").trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const emails = rows
    .flatMap((r) => [r.email, r.companyEmail])
    .map((e) =>
      String(e ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  const userById = new Map<string, string>();
  if (authIds.length) {
    const found = await tx.select({ id: users.id }).from(users).where(inArray(users.id, authIds));
    for (const u of found) userById.set(u.id, u.id);
  }
  const userByEmail = new Map<string, string>();
  if (emails.length) {
    const emailClauses = emails
      .slice(0, 500)
      .map((email) => sql`lower(${users.primaryEmail}) = ${email}`);
    if (emailClauses.length) {
      const found = await tx
        .select({ id: users.id, email: users.primaryEmail })
        .from(users)
        .where(or(...emailClauses));
      for (const u of found) {
        if (u.email) userByEmail.set(u.email.toLowerCase(), u.id);
      }
    }
  }

  const seenPersonnel = new Set<string>();
  const phoneOwner = new Map<string, string>();
  const recipients: ResolvedRecipient[] = [];

  for (const row of rows) {
    if (seenPersonnel.has(row.id)) continue;
    seenPersonnel.add(row.id);

    const status = String(row.status ?? "").toUpperCase();
    // SMS Notification number is the personnel phone (not company phone).
    const phone = pickSmsNotificationPhone(row.phone);
    let smsEligible = phone.eligible;
    let exclusionReason = phone.reason;

    if (status !== "ACTIVE") {
      smsEligible = false;
      exclusionReason =
        status === "TERMINATED" || status === "INACTIVE" ? status : "INACTIVE_EMPLOYEE";
    } else if (row.smsOptedOutAt) {
      smsEligible = false;
      exclusionReason = "OPTED_OUT";
    } else if (!row.smsAuthorizedAt) {
      smsEligible = false;
      exclusionReason = "SMS_NOT_AUTHORIZED";
    } else if (smsEligible && phone.snapshot) {
      const prior = phoneOwner.get(phone.snapshot);
      if (prior && prior !== row.id) {
        smsEligible = false;
        exclusionReason = "DUPLICATE_NUMBER";
      } else {
        phoneOwner.set(phone.snapshot, row.id);
      }
    }

    const auth = String(row.userAuthId ?? "").trim();
    let userId: string | null = userById.get(auth) ?? null;
    if (!userId) {
      const email = String(row.email ?? row.companyEmail ?? "")
        .trim()
        .toLowerCase();
      userId = email ? (userByEmail.get(email) ?? null) : null;
    }

    recipients.push({
      personnelId: row.id,
      userId,
      displayName: row.displayName,
      recipientType: "EMPLOYEE",
      locationId: row.siteId,
      departmentId: row.departmentId,
      phoneNumberSnapshot: phone.snapshot,
      smsEligible,
      exclusionReason: smsEligible ? null : exclusionReason,
    });
  }

  return { audience, recipients };
}

export function summarizeAudience(
  audience: AlertAudience,
  recipients: ResolvedRecipient[],
  mvixLocations: number,
): AudiencePreview {
  const exclusions = new Map<string, number>();
  let smsEligible = 0;
  let forgeUsers = 0;
  let excluded = 0;
  const phones = new Set<string>();

  for (const r of recipients) {
    if (r.userId) forgeUsers += 1;
    if (r.smsEligible && r.phoneNumberSnapshot) {
      smsEligible += 1;
      phones.add(r.phoneNumberSnapshot);
    } else {
      excluded += 1;
      const reason = r.exclusionReason ?? "EXCLUDED";
      exclusions.set(reason, (exclusions.get(reason) ?? 0) + 1);
    }
  }

  return {
    audience,
    employees: recipients.length,
    contractors: 0,
    totalPersonnel: recipients.length,
    uniqueSmsNumbers: phones.size,
    smsEligible,
    forgeUsers,
    excluded,
    exclusions: [...exclusions.entries()].map(([reason, count]) => ({ reason, count })),
    mvixLocations,
    sample: recipients.slice(0, 12).map((r) => ({
      personnelId: r.personnelId,
      displayName: r.displayName,
      smsEligible: r.smsEligible,
      exclusionReason: r.exclusionReason,
    })),
  };
}

export async function countMvixLocationsForAudience(
  tx: DatabaseTransaction,
  tenantId: string,
  audience: AlertAudience,
): Promise<number> {
  if (audience.scope === "TENANT" || !audience.locationIds.length) {
    // Tenant-wide: count all sites as potential Mvix targets (feeds may be 1:1 later).
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(industrialSites)
      .where(and(eq(industrialSites.tenantId, tenantId), isNull(industrialSites.archivedAt)));
    return row?.count ?? 0;
  }
  return audience.locationIds.length;
}

export async function listTargetLookups(tx: DatabaseTransaction, tenantId: string) {
  const [sites, departments, groups] = await Promise.all([
    tx
      .select({
        id: industrialSites.id,
        name: industrialSites.name,
        status: industrialSites.status,
      })
      .from(industrialSites)
      .where(and(eq(industrialSites.tenantId, tenantId), isNull(industrialSites.archivedAt)))
      .orderBy(asc(industrialSites.name)),
    tx
      .select({
        id: industrialDepartments.id,
        name: industrialDepartments.name,
        siteId: industrialDepartments.siteId,
        status: industrialDepartments.status,
      })
      .from(industrialDepartments)
      .where(
        and(eq(industrialDepartments.tenantId, tenantId), isNull(industrialDepartments.archivedAt)),
      )
      .orderBy(asc(industrialDepartments.name)),
    tx
      .select({
        id: industrialEmergencyAlertGroups.id,
        name: industrialEmergencyAlertGroups.name,
        groupType: industrialEmergencyAlertGroups.groupType,
        dynamic: industrialEmergencyAlertGroups.dynamic,
        enabled: industrialEmergencyAlertGroups.enabled,
        locationId: industrialEmergencyAlertGroups.locationId,
        departmentId: industrialEmergencyAlertGroups.departmentId,
      })
      .from(industrialEmergencyAlertGroups)
      .where(
        and(
          eq(industrialEmergencyAlertGroups.tenantId, tenantId),
          eq(industrialEmergencyAlertGroups.enabled, true),
        ),
      )
      .orderBy(asc(industrialEmergencyAlertGroups.name)),
  ]);

  return { sites, departments, groups };
}
