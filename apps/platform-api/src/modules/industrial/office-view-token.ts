import { createHmac, timingSafeEqual } from "node:crypto";

export const OFFICE_VIEW_TTL_MS = 60 * 60 * 1000;

function officeViewSecret(): string {
  return (
    process.env.FORGE_INDUSTRIAL_PORTAL_TOKEN_SECRET?.trim() ||
    "forge-industrial-portal-token-dev-key"
  );
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function issueOfficeViewToken(
  tenantId: string,
  materialId: string,
): { token: string; expiresAt: string; expiresInSeconds: number } {
  const exp = Date.now() + OFFICE_VIEW_TTL_MS;
  const payload = JSON.stringify({ tenantId, materialId, exp });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", officeViewSecret()).update(payloadB64).digest("base64url");
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: new Date(exp).toISOString(),
    expiresInSeconds: Math.floor(OFFICE_VIEW_TTL_MS / 1000),
  };
}

export function verifyOfficeViewToken(
  token: string,
  materialId: string,
): { tenantId: string } | null {
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = createHmac("sha256", officeViewSecret()).update(payloadB64).digest("base64url");
  if (!safeEqual(expected, sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      tenantId?: string;
      materialId?: string;
      exp?: number;
    };
    if (
      payload.materialId !== materialId ||
      !payload.tenantId?.trim() ||
      typeof payload.exp !== "number" ||
      payload.exp < Date.now()
    ) {
      return null;
    }
    return { tenantId: payload.tenantId.trim() };
  } catch {
    return null;
  }
}

export function buildOfficeMaterialViewUrl(
  publicApiUrl: string,
  materialId: string,
  token: string,
): string {
  const base = publicApiUrl.replace(/\/$/, "");
  return `${base}/api/v1/public/training/materials/${encodeURIComponent(materialId)}/office-view?token=${encodeURIComponent(token)}`;
}
