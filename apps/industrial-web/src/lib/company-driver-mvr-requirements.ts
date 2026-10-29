/**
 * MVR and MVR Consent requirements for company drivers (insurance roster).
 */

export type CompanyDriverMvrFile = {
  name: string;
  documentId?: string;
  uploadedAt?: string;
  contentType?: string;
};

export type CompanyDriverMvrSnapshot = {
  status?: string;
  initialMvrDate?: string;
  lastMvrDate?: string;
  mvrReleaseDate?: string;
  mvrUploadCount?: number;
  mvrReleaseUploadCount?: number;
  mvrFiles?: CompanyDriverMvrFile[];
  mvrConsentFiles?: CompanyDriverMvrFile[];
};

function parseFileList(raw: unknown): CompanyDriverMvrFile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const name = String(row.name ?? row.fileName ?? row.originalFilename ?? "").trim();
      const documentId = String(row.documentId ?? "").trim();
      if (!name && !documentId) return null;
      const uploadedAt = String(row.uploadedAt ?? "").trim();
      const contentType = String(row.contentType ?? row.mimeType ?? "").trim();
      return {
        name: name || "Document",
        ...(documentId ? { documentId } : {}),
        ...(uploadedAt ? { uploadedAt } : {}),
        ...(contentType ? { contentType } : {}),
      };
    })
    .filter((row): row is CompanyDriverMvrFile => row != null);
}

export function parseCompanyDriverMvrSnapshot(value: unknown): CompanyDriverMvrSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const mvrFiles = parseFileList(row.mvrFiles);
  const mvrConsentFiles = parseFileList(row.mvrConsentFiles);
  return {
    status: typeof row.status === "string" ? row.status.trim() : "",
    initialMvrDate: typeof row.initialMvrDate === "string" ? row.initialMvrDate.trim() : "",
    lastMvrDate: typeof row.lastMvrDate === "string" ? row.lastMvrDate.trim() : "",
    mvrReleaseDate: typeof row.mvrReleaseDate === "string" ? row.mvrReleaseDate.trim() : "",
    mvrUploadCount: typeof row.mvrUploadCount === "number" ? row.mvrUploadCount : mvrFiles.length,
    mvrReleaseUploadCount:
      typeof row.mvrReleaseUploadCount === "number"
        ? row.mvrReleaseUploadCount
        : mvrConsentFiles.length,
    mvrFiles,
    mvrConsentFiles,
  };
}

export function companyDriverMvrOnFile(
  snapshot: CompanyDriverMvrSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return (
    (snapshot.mvrUploadCount ?? 0) > 0 ||
    (snapshot.mvrFiles?.length ?? 0) > 0 ||
    Boolean(snapshot.lastMvrDate) ||
    Boolean(snapshot.initialMvrDate)
  );
}

export function companyDriverMvrConsentOnFile(
  snapshot: CompanyDriverMvrSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return (
    (snapshot.mvrReleaseUploadCount ?? 0) > 0 ||
    (snapshot.mvrConsentFiles?.length ?? 0) > 0 ||
    Boolean(snapshot.mvrReleaseDate)
  );
}

/** Human labels for missing company-driver compliance items. */
export function missingCompanyDriverMvrRequirements(
  snapshot: CompanyDriverMvrSnapshot | null | undefined,
): string[] {
  const missing: string[] = [];
  if (!companyDriverMvrOnFile(snapshot)) missing.push("MVR");
  if (!companyDriverMvrConsentOnFile(snapshot)) missing.push("MVR Consent form");
  return missing;
}
