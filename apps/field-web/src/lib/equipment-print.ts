/**
 * Equipment Brady / Print Label field helpers (Field port of industrial module-print-fields).
 */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function put(out: Record<string, string>, key: string, value: unknown) {
  const next = text(value);
  if (next) out[key] = next;
}

function absoluteUrl(pathOrUrl: string, appBaseUrl?: string | null): string {
  const raw = pathOrUrl.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const base =
    (typeof appBaseUrl === "string" && appBaseUrl.trim()) ||
    (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return raw;
  try {
    return new URL(raw.startsWith("/") ? raw : `/${raw}`, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return raw;
  }
}

export function equipmentPrintFieldValues(
  item: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!item) return {};
  const name = text(item.equipmentName || item.name || item.title);
  const id = text(item.assetTag || item.equipmentNumber || item.externalEquipmentId || item.id);
  const out: Record<string, string> = {};
  put(out, "title", name || "Equipment");
  put(out, "name", name || id);
  put(out, "id", id);
  put(out, "status", item.status);
  put(out, "description", item.description);
  put(out, "assetTag", item.assetTag || item.equipmentNumber);
  put(out, "type", item.equipmentType || item.category);
  return out;
}

/**
 * Ensure a public scan URL exists for an equipment asset (create/issue QR link if needed).
 */
export async function ensureEquipmentPrintQrPayload(
  item: Record<string, unknown> | null | undefined,
  opts?: {
    appBaseUrl?: string | null;
    canView?: boolean;
    canGenerate?: boolean;
  },
): Promise<{ qr: string; qrPayload: string }> {
  if (!item?.id) {
    throw new Error("Equipment id is required to build a QR code.");
  }
  const id = String(item.id);
  const appBaseUrl =
    (typeof opts?.appBaseUrl === "string" && opts.appBaseUrl.trim()) ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const canView = opts?.canView !== false;
  const canGenerate = opts?.canGenerate !== false;

  const { apiGet, apiSend } = await import("@forge/web-kit");
  type LinkRow = {
    id: string;
    targetId?: string | null;
    targetType?: string | null;
    publicToken?: string;
    token?: string;
    url?: string;
    accessMode?: string;
    qrType?: string;
  };

  const equipmentTargetTypes = new Set(["EQUIPMENT", "MACHINE", "TOOL"]);
  let link: LinkRow | undefined;
  if (canView) {
    const listed = await apiGet<{ items?: LinkRow[] }>("/api/v1/qr-links", {
      query: { targetType: "EQUIPMENT", page: "1", pageSize: "100" },
    });
    link = (listed.items ?? []).find(
      (row) => row.targetId === id && equipmentTargetTypes.has(String(row.targetType ?? "")),
    );
  }

  const equipmentLabel =
    text(item.equipmentName || item.name || item.title || item.assetTag || item.equipmentNumber) ||
    "Equipment";

  if (!link) {
    if (!canGenerate) {
      throw new Error("No QR code for this equipment, and you cannot create one.");
    }
    link = await apiSend<LinkRow>("/api/v1/qr-links", "POST", {
      name: `${equipmentLabel} QR`,
      targetType: "EQUIPMENT",
      targetId: id,
      accessMode: "EMPLOYEE_NUMBER",
      issueToken: true,
      isPublic: true,
      appBaseUrl,
      actionConfig: {
        reportIssue: true,
        dailyInspection: true,
        weeklyInspection: true,
        monthlyInspection: true,
        equipmentHistory: true,
        viewLoto: true,
        viewJsa: true,
        viewDocuments: true,
        viewTraining: true,
      },
    });
  } else if (!link.publicToken && !link.token && canGenerate) {
    link = await apiSend<LinkRow>(
      `/api/v1/qr-links/${encodeURIComponent(link.id)}/issue-token`,
      "POST",
      { appBaseUrl },
    );
  }

  const token = String(link.publicToken ?? link.token ?? "").trim();
  const fromApi = text(link.url);
  const url =
    fromApi ||
    (token && appBaseUrl ? absoluteUrl(`/scan/${encodeURIComponent(token)}`, appBaseUrl) : "");
  if (!url) {
    throw new Error("QR link exists but has no public URL yet.");
  }

  return { qr: url, qrPayload: url };
}
