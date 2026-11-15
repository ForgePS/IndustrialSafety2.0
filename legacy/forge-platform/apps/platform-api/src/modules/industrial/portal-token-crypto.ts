import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SEALED_PREFIX = "v1:";

function portalTokenKey(tenantId: string): Buffer {
  const secret =
    process.env.FORGE_INDUSTRIAL_PORTAL_TOKEN_SECRET?.trim() ||
    "forge-industrial-portal-token-dev-key";
  return createHash("sha256").update(`${secret}:${tenantId}`).digest();
}

/** Seal a portal token for server-side QR re-display without rotating the hash. */
export function sealPortalToken(tenantId: string, token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", portalTokenKey(tenantId), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SEALED_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

export function openPortalToken(tenantId: string, sealed: string): string | null {
  if (!sealed.startsWith(SEALED_PREFIX)) return null;
  try {
    const buf = Buffer.from(sealed.slice(SEALED_PREFIX.length), "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", portalTokenKey(tenantId), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function readSealedPortalToken(policyJson: unknown): string | null {
  const policy =
    policyJson && typeof policyJson === "object" && !Array.isArray(policyJson)
      ? (policyJson as Record<string, unknown>)
      : {};
  const sealed = policyJsonPortalTokenSealed(policy);
  return typeof sealed === "string" && sealed.trim() ? sealed.trim() : null;
}

export function policyJsonPortalTokenSealed(policy: Record<string, unknown>): string | null {
  const sealed = policy.portalTokenSealed;
  return typeof sealed === "string" ? sealed : null;
}

export function withSealedPortalToken(
  policyJson: unknown,
  tenantId: string,
  token: string,
): Record<string, unknown> {
  const policy =
    policyJson && typeof policyJson === "object" && !Array.isArray(policyJson)
      ? { ...(policyJson as Record<string, unknown>) }
      : {};
  policy.portalTokenSealed = sealPortalToken(tenantId, token);
  return policy;
}

export function withoutSealedPortalToken(policyJson: unknown): Record<string, unknown> {
  const policy =
    policyJson && typeof policyJson === "object" && !Array.isArray(policyJson)
      ? { ...(policyJson as Record<string, unknown>) }
      : {};
  delete policy.portalTokenSealed;
  return policy;
}
