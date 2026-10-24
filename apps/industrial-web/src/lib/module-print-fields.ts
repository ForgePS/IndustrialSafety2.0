/**
 * Shared label field maps for ForgePrintButton / ForgePrintDialog.
 * Keep printer-specific logic out of modules — only record display fields + QR payloads.
 */

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Unwrap object payloads, including JSON strings Postgres/jsonb sometimes returns as text. */
function asRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return {};
    try {
      return asRecord(JSON.parse(trimmed) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed[0] !== "[") return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function put(out: Record<string, string>, key: string, value: unknown) {
  const v = text(value);
  if (v) out[key] = v;
}

function stepOwnDescription(row: Record<string, unknown>): string {
  const nested = asRecord(row.sourcePayload ?? row.source_payload);
  return (
    text(row.customDescription) ||
    text(row.customText) ||
    text(nested.customDescription) ||
    text(nested.customText) ||
    // Some saved rows only keep the free-text detail inside printed/instruction copy.
    (() => {
      const printed =
        text(row.printedProcedureDescription) ||
        text(row.printedDescription) ||
        text(nested.printedProcedureDescription) ||
        text(nested.printedDescription) ||
        text(row.instruction) ||
        text(nested.instruction);
      const match = printed.match(/(?:^|\s|—|-)\s*Detail:\s*(.+?)(?:\s*—\s*|$)/i);
      return match?.[1]?.trim() || "";
    })()
  );
}

/**
 * Collect unique "Enter your own description" values from LOTO procedure steps.
 * Looks at top-level steps and nested sourcePayload.steps (object or JSON string).
 */
export function lotoProcedureOwnDescriptions(
  item: Record<string, unknown> | null | undefined,
): string {
  if (!item) return "";
  const procedure = asRecord(item.procedure ?? item);
  const payload = asRecord(
    procedure.sourcePayload ??
      procedure.source_payload ??
      item.sourcePayload ??
      item.source_payload,
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
    return new URL(
      raw.startsWith("/") ? raw : `/${raw}`,
      base.endsWith("/") ? base : `${base}/`,
    ).toString();
  } catch {
    return raw;
  }
}

export function equipmentPrintFieldValues(
  item: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!item) return {};
  const name = text(item.equipmentName || item.name);
  const id = text(item.assetTag || item.equipmentNumber || item.externalEquipmentId || item.id);
  const out: Record<string, string> = {};
  put(out, "title", name || "Equipment");
  put(out, "name", name || id);
  put(out, "id", id);
  put(out, "assetTag", item.assetTag || item.equipmentNumber);
  put(out, "location", item.siteName || item.locationName);
  put(out, "division", item.divisionName || item.division || item.site);
  put(out, "department", item.departmentName || item.department);
  put(out, "area", item.areaName || item.locationDetail);
  put(out, "manufacturer", item.manufacturer);
  put(out, "model", item.model);
  put(out, "serialNumber", item.serialNumber);
  put(out, "type", item.equipmentType || item.category);
  return out;
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
  // Always expose the key so Print Label shows the opt-in checkbox even before detail loads.
  out.description = lotoProcedureOwnDescriptions(item);
  return out;
}

/**
 * Ensure a public scan URL exists for a LOTO procedure (create/issue QR link if needed).
 * Used by Print Label so Brady labels include a scannable QR.
 * Also resolves optional "Enter your own description" text for the Content checkboxes.
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

  // Always try procedure detail for own-description — list rows often omit step payloads,
  // and this must not depend on QR-link view permission.
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

/**
 * Ensure a public scan URL exists for an equipment asset (create/issue QR link if needed).
 * Used by Print Label so Brady labels include a scannable QR.
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
    text(item.equipmentName || item.name || item.assetTag || item.equipmentNumber) || "Equipment";

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

export function supplyItemPrintFieldValues(
  item: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!item) return {};
  const name = text(item.name || item.itemName);
  const out: Record<string, string> = {};
  put(out, "title", name || "Supply");
  put(out, "name", name);
  put(out, "itemNumber", item.itemNumber || item.sku);
  return out;
}

export function inspectionPrintFieldValues(
  item: Record<string, unknown> | null | undefined,
  opts?: { appBaseUrl?: string | null; closeoutUrl?: string | null },
): Record<string, string> {
  if (!item) return {};
  const title = text(item.title) || "Inspection";
  const out: Record<string, string> = {};
  put(out, "title", title);
  put(out, "name", title);
  put(out, "status", item.status);
  put(out, "department", item.departmentName || item.department);
  put(out, "id", item.id);
  const closeout = text(opts?.closeoutUrl || item.closeoutUrl);
  if (closeout) {
    const qr = absoluteUrl(closeout, opts?.appBaseUrl);
    put(out, "qr", qr);
    put(out, "qrPayload", qr);
  }
  return out;
}

export function trainingPortalPrintFieldValues(input: {
  url: string;
  title?: string | null;
}): Record<string, string> {
  const url = text(input.url);
  const title = text(input.title) || "Training Portal";
  const out: Record<string, string> = {
    title,
    name: title,
    brand: "FORGE",
    subtitle: "Scan to open training",
  };
  if (url) {
    out.qr = url;
    out.qrPayload = url;
  }
  return out;
}

export function personnelPrintFieldValues(
  person: Record<string, unknown> | null | undefined,
  opts?: { appBaseUrl?: string | null; personHref?: string | null },
): Record<string, string> {
  if (!person) return {};
  const name =
    text(person.displayName) ||
    [person.firstName, person.lastName].map(text).filter(Boolean).join(" ") ||
    "Personnel";
  const out: Record<string, string> = {};
  put(out, "title", name);
  put(out, "name", name);
  put(out, "employeeNumber", person.employeeNumber || person.employeeId);
  put(out, "department", person.departmentName || person.department);
  put(out, "site", person.siteName || person.locationName);
  const href =
    text(opts?.personHref) ||
    (person.id ? `/modules/personnel/person/?id=${encodeURIComponent(String(person.id))}` : "");
  if (href) {
    const qr = absoluteUrl(href, opts?.appBaseUrl);
    put(out, "qr", qr);
    put(out, "qrPayload", qr);
  }
  return out;
}

export function dotVehiclePrintFieldValues(
  item: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!item) return {};
  const title =
    text(item.assetNumber || item.unitNumber || item.name) ||
    text(item.vin)?.slice(-6) ||
    "DOT Vehicle";
  const out: Record<string, string> = {};
  put(out, "title", title);
  put(out, "name", title);
  put(out, "vin", item.vin);
  put(out, "plate", item.licensePlate || item.plate);
  put(out, "driver", item.driverName || item.assignedDriverName);
  put(out, "status", item.status);
  return out;
}

export function sanitationLocationPrintFieldValues(
  item: Record<string, unknown> | null | undefined,
  opts?: { qrUrl?: string | null },
): Record<string, string> {
  if (!item) return {};
  const name = text(item.name || item.label) || "Sanitation location";
  const out: Record<string, string> = {};
  put(out, "title", name);
  put(out, "name", name);
  put(out, "zone", item.zone || item.area || item.areaName);
  put(out, "status", item.status);
  const qr = text(opts?.qrUrl || item.qrUrl || item.publicUrl);
  if (qr) {
    put(out, "qr", qr);
    put(out, "qrPayload", qr);
  }
  return out;
}

export function pestDevicePrintFieldValues(
  item: Record<string, unknown> | null | undefined,
  opts?: { qrUrl?: string | null },
): Record<string, string> {
  if (!item) return {};
  const name = text(item.name || item.deviceCode || item.code) || "Pest device";
  const out: Record<string, string> = {};
  put(out, "title", name);
  put(out, "name", name);
  put(out, "type", item.deviceType || item.type);
  put(out, "location", item.locationName || item.location);
  put(out, "status", item.status);
  const qr = text(opts?.qrUrl || item.qrUrl || item.publicUrl);
  if (qr) {
    put(out, "qr", qr);
    put(out, "qrPayload", qr);
  }
  return out;
}

export function oshaCasePrintFieldValues(
  item: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!item) return {};
  const caseNumber = text(item.caseNumber || item.oshaCaseNumber || item.id);
  const title = caseNumber ? `OSHA ${caseNumber}` : "OSHA Case";
  const out: Record<string, string> = {};
  put(out, "title", title);
  put(out, "name", title);
  put(out, "year", item.year || item.caseYear);
  put(out, "establishment", item.establishmentName || item.establishment);
  put(out, "status", item.status);
  return out;
}

export function emergencyRecordPrintFieldValues(
  item: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!item) return {};
  const title = text(item.title || item.name || item.planName) || "Emergency record";
  const out: Record<string, string> = {};
  put(out, "title", title);
  put(out, "name", title);
  put(out, "planId", item.planId || item.planCode);
  put(out, "status", item.status);
  put(out, "eventDate", item.eventDate || item.occurredAt || item.createdAt);
  return out;
}
