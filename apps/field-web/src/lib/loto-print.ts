/**
 * LOTO Brady / Print Label field helpers (Field port of industrial module-print-fields).
 */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function put(out: Record<string, string>, key: string, value: unknown) {
  const next = text(value);
  if (next) out[key] = next;
}

function stepOwnDescription(row: Record<string, unknown>): string {
  const payload = asRecord(row.sourcePayload ?? row.source_payload);
  return (
    text(row.customDescription) ||
    text(row.customText) ||
    text(payload.customDescription) ||
    text(payload.customText)
  );
}

/** Collect unique "Enter your own description" values from LOTO procedure steps. */
export function lotoProcedureOwnDescriptions(
  item: Record<string, unknown> | null | undefined,
): string {
  if (!item) return "";
  const procedure = asRecord(item.procedure ?? item);
  const payload = asRecord(
    procedure.sourcePayload ?? procedure.source_payload ?? item.sourcePayload ?? item.source_payload,
  );
  const sources = [
    item.steps,
    procedure.steps,
    payload.steps,
    item.energySources,
    procedure.energySources,
    payload.energySources,
  ];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const source of sources) {
    for (const raw of asArray(source)) {
      const row = asRecord(raw);
      const value = stepOwnDescription(row) || text(row.description) || text(row.energyNotes);
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(value);
    }
  }
  return parts.join(" · ");
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

export function lotoProcedurePrintFieldValues(
  item: Record<string, unknown> | null | undefined,
  equipmentName?: string | null,
): Record<string, string> {
  if (!item) return {};
  const title = text(equipmentName || item.equipmentName || item.title || item.name) || "LOTO";
  const out: Record<string, string> = {};
  put(out, "title", title);
  put(out, "name", title);
  put(out, "status", item.status);
  put(out, "id", item.id);
  out.description = lotoProcedureOwnDescriptions(item);
  return out;
}

/**
 * Ensure a public scan URL exists for a LOTO procedure (create/issue QR link if needed).
 */
export async function ensureLotoProcedurePrintQrPayload(
  item: Record<string, unknown> | null | undefined,
  opts?: {
    appBaseUrl?: string | null;
    canView?: boolean;
    canGenerate?: boolean;
  },
): Promise<{ qr: string; qrPayload: string; description?: string }> {
  if (!item?.id) {
    throw new Error("LOTO procedure id is required to build a QR code.");
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
  };

  let link: LinkRow | undefined;
  if (canView) {
    const listed = await apiGet<{ items?: LinkRow[] }>("/api/v1/qr-links", {
      query: { targetType: "LOTO_PROCEDURE", page: "1", pageSize: "100" },
    });
    link = (listed.items ?? []).find(
      (row) => row.targetId === id && row.targetType === "LOTO_PROCEDURE",
    );
  }

  const equipmentLabel =
    text(item.equipmentName || item.title || item.name || item.procedureNumber) || "LOTO procedure";

  if (!link) {
    if (!canGenerate) {
      throw new Error("No QR code for this procedure, and you cannot create one.");
    }
    link = await apiSend<LinkRow>("/api/v1/qr-links", "POST", {
      name: `${equipmentLabel} LOTO QR`,
      targetType: "LOTO_PROCEDURE",
      targetId: id,
      accessMode: "PUBLIC_ACTION",
      issueToken: true,
      isPublic: true,
      appBaseUrl,
      actionConfig: {
        viewLoto: true,
        reportIssue: true,
        lotoProcedureId: id,
      },
    });
  } else {
    const mode = String(
      (link as { accessMode?: string; qrType?: string }).accessMode ??
        (link as { qrType?: string }).qrType ??
        "",
    ).toUpperCase();
    if (canGenerate && !mode.startsWith("PUBLIC_")) {
      link = await apiSend<LinkRow>(`/api/v1/qr-links/${encodeURIComponent(link.id)}`, "PATCH", {
        accessMode: "PUBLIC_ACTION",
        qrType: "PUBLIC_ACTION",
        actionConfig: {
          viewLoto: true,
          reportIssue: true,
          lotoProcedureId: id,
        },
      });
    }
    if (!link.publicToken && !link.token && canGenerate) {
      link = await apiSend<LinkRow>(
        `/api/v1/qr-links/${encodeURIComponent(link.id)}/issue-token`,
        "POST",
        { appBaseUrl },
      );
    }
  }

  const token = String(link.publicToken ?? link.token ?? "").trim();
  const fromApi = text(link.url);
  const url =
    fromApi ||
    (token && appBaseUrl ? absoluteUrl(`/scan/${encodeURIComponent(token)}`, appBaseUrl) : "");
  if (!url) {
    throw new Error("QR link exists but has no public URL yet.");
  }

  let description = lotoProcedureOwnDescriptions(item);
  try {
    const detail = await apiGet<Record<string, unknown>>(
      `/api/v1/industrial/loto/${encodeURIComponent(id)}`,
    );
    description = lotoProcedureOwnDescriptions(detail) || description;
  } catch {
    // QR still works without description.
  }

  return { qr: url, qrPayload: url, description };
}
