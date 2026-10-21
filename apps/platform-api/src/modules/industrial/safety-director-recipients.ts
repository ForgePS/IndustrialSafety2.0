import {
  membershipRoleAssignments,
  roles,
  users,
  userTenantMemberships,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { isSafetyDirectorRole } from "./form-signatory.js";

/** Stored on report_recipients.email to resolve Safety Director inboxes at send time. */
export const SAFETY_DIRECTOR_RECIPIENT_MARKER = "role:SAFETY_DIRECTOR";

export type SafetyDirectorRecipient = {
  userId: string;
  email: string;
};

export function isSafetyDirectorRecipientMarker(email: string): boolean {
  return email.trim().toUpperCase() === SAFETY_DIRECTOR_RECIPIENT_MARKER.toUpperCase();
}

/**
 * Active tenant members with a Safety Director / EHS Director (or starter-template
 * Safety Manager) role assignment. Blank emails are included so callers can decide
 * whether to skip or fail.
 */
export async function listSafetyDirectorRecipients(
  db: Database,
  tenantId: string,
  actorUserId?: string | null,
): Promise<SafetyDirectorRecipient[]> {
  return withTenantTransaction(
    db,
    tenantId,
    async (tx) => {
      const rows = await tx
        .select({
          userId: users.id,
          email: users.primaryEmail,
          roleCode: roles.code,
          roleName: roles.name,
        })
        .from(membershipRoleAssignments)
        .innerJoin(roles, eq(roles.id, membershipRoleAssignments.roleId))
        .innerJoin(
          userTenantMemberships,
          eq(userTenantMemberships.id, membershipRoleAssignments.membershipId),
        )
        .innerJoin(users, eq(users.id, userTenantMemberships.userId))
        .where(
          and(
            eq(membershipRoleAssignments.tenantId, tenantId),
            eq(userTenantMemberships.tenantId, tenantId),
            eq(userTenantMemberships.status, "ACTIVE"),
            inArray(membershipRoleAssignments.status, ["ACTIVE", "PENDING"]),
            isNull(membershipRoleAssignments.revokedAt),
          ),
        );

      const byUser = new Map<string, SafetyDirectorRecipient>();
      for (const row of rows) {
        if (!isSafetyDirectorRole({ roleCode: row.roleCode, roleName: row.roleName })) continue;
        if (!row.userId || byUser.has(row.userId)) continue;
        byUser.set(row.userId, {
          userId: row.userId,
          email: String(row.email ?? "").trim(),
        });
      }
      return [...byUser.values()];
    },
    actorUserId ?? undefined,
  );
}
