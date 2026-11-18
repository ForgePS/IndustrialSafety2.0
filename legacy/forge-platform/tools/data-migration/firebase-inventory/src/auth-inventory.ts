/** Firebase Auth metadata inventory — no password hashes, no PII dumps. */
import type { Auth } from "firebase-admin/auth";

export type AuthSummary = {
  totalUsers: number;
  enabledUsers: number;
  disabledUsers: number;
  verifiedEmailUsers: number;
  unverifiedEmailUsers: number;
  providerCounts: Record<string, number>;
  mfaEnrolledUsers: number;
  businessClaimUsers: number;
  distinctBusinessIdsFromClaims: string[];
  linkageMethod: string;
};

export async function inventoryAuth(auth: Auth): Promise<AuthSummary> {
  let totalUsers = 0;
  let enabledUsers = 0;
  let disabledUsers = 0;
  let verifiedEmailUsers = 0;
  let unverifiedEmailUsers = 0;
  let mfaEnrolledUsers = 0;
  let businessClaimUsers = 0;
  const providerCounts: Record<string, number> = {};
  const businessIds = new Set<string>();
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      totalUsers += 1;
      if (user.disabled) disabledUsers += 1;
      else enabledUsers += 1;
      if (user.emailVerified) verifiedEmailUsers += 1;
      else if (user.email) unverifiedEmailUsers += 1;

      for (const p of user.providerData) {
        const id = p.providerId || "unknown";
        providerCounts[id] = (providerCounts[id] ?? 0) + 1;
      }
      if (!user.providerData.length) {
        providerCounts.custom = (providerCounts.custom ?? 0) + 1;
      }

      if (user.multiFactor?.enrolledFactors?.length) mfaEnrolledUsers += 1;

      const claims = (user.customClaims ?? {}) as Record<string, unknown>;
      const raw =
        claims.businessIds ?? claims.businessId ?? claims.businesses ?? claims.organizationIds;
      const ids = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
      if (ids.length) {
        businessClaimUsers += 1;
        for (const id of ids) {
          if (typeof id === "string" && id.length < 128) businessIds.add(id);
        }
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return {
    totalUsers,
    enabledUsers,
    disabledUsers,
    verifiedEmailUsers,
    unverifiedEmailUsers,
    providerCounts,
    mfaEnrolledUsers,
    businessClaimUsers,
    distinctBusinessIdsFromClaims: [...businessIds].sort(),
    linkageMethod:
      "customClaims.businessIds|businessId|businesses + optional Firestore personnel/user docs by uid/email (join details in DM-S1)",
  };
}
