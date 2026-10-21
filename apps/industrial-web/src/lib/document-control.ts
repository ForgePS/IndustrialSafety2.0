import { apiGet, apiSend } from "@forge/web-kit";

export const DOCUMENTS_API = "/api/v1/industrial/documents";

export type DocumentControlTab =
  | "library"
  | "document"
  | "approvals"
  | "acknowledgments"
  | "reviews";

export const DOCUMENT_CONTROL_TABS: ReadonlyArray<{ id: DocumentControlTab; label: string }> = [
  { id: "library", label: "Library" },
  { id: "document", label: "Document" },
  { id: "approvals", label: "Approvals" },
  { id: "acknowledgments", label: "Acknowledgments" },
  { id: "reviews", label: "Reviews" },
];

export type ControlledDocument = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  documentNumber?: string | null;
  siteId?: string | null;
  status: string;
  workflowStatus: string;
  ownerUserId?: string | null;
  reviewDueAt?: string | null;
  currentApprovedVersionId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  archivedAt?: string | null;
  reviewOverdue?: boolean;
  reviewDueSoon?: boolean;
  versions?: ControlledDocumentVersion[];
  distributions?: Array<{
    id: string;
    scopeType: string;
    scopeId: string | null;
    enabled: boolean;
  }>;
};

export type ControlledDocumentVersion = {
  id: string;
  documentId: string;
  versionNumber: number;
  filename?: string | null;
  contentType?: string | null;
  contentLength?: number;
  status: string;
  workflowStatus: string;
  changeSummary?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  hasFile?: boolean;
  createdAt?: string | null;
};

export function workflowBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "PUBLISHED" || s === "APPROVED") return "bg-label-success";
  if (s === "IN_REVIEW") return "bg-label-warning";
  if (s === "OBSOLETE" || s === "SUPERSEDED") return "bg-label-secondary";
  return "bg-label-primary";
}

export function formatWorkflowLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export async function listControlledDocuments(query: Record<string, string> = {}) {
  return apiGet<{ items: ControlledDocument[]; page: number; pageSize: number; total: number }>(
    DOCUMENTS_API,
    { query },
  );
}

export async function getControlledDocument(id: string) {
  return apiGet<ControlledDocument>(`${DOCUMENTS_API}/${encodeURIComponent(id)}`);
}

export async function createControlledDocument(body: Record<string, unknown>) {
  return apiSend<ControlledDocument>(DOCUMENTS_API, "POST", body);
}

export async function updateControlledDocument(id: string, body: Record<string, unknown>) {
  return apiSend<ControlledDocument>(`${DOCUMENTS_API}/${encodeURIComponent(id)}`, "PATCH", body);
}

export async function archiveControlledDocument(id: string) {
  return apiSend(`${DOCUMENTS_API}/${encodeURIComponent(id)}/archive`, "POST", {});
}

export async function obsoleteControlledDocument(id: string) {
  return apiSend(`${DOCUMENTS_API}/${encodeURIComponent(id)}/obsolete`, "POST", {});
}

export async function uploadControlledVersion(documentId: string, file: File, changeSummary?: string) {
  const init = await apiSend<{
    versionId: string;
    uploadUrl: string;
  }>(`${DOCUMENTS_API}/${encodeURIComponent(documentId)}/versions/upload-url`, "POST", {
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    contentLength: file.size,
    ...(changeSummary ? { changeSummary } : {}),
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", init.uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-amz-server-side-encryption", "aws:kms");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload blocked by network/CORS"));
    xhr.send(file);
  });
  await apiSend(
    `${DOCUMENTS_API}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(init.versionId)}/complete`,
    "POST",
    {},
  );
  return init.versionId;
}

export async function downloadControlledVersion(documentId: string, versionId: string) {
  return apiGet<{ downloadUrl: string; filename?: string | null }>(
    `${DOCUMENTS_API}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/download-url`,
  );
}

export async function submitVersionReview(documentId: string, versionId: string) {
  return apiSend(
    `${DOCUMENTS_API}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/submit-review`,
    "POST",
    {},
  );
}

export async function approveVersion(documentId: string, versionId: string) {
  return apiSend(
    `${DOCUMENTS_API}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/approve`,
    "POST",
    {},
  );
}

export async function rejectVersion(documentId: string, versionId: string) {
  return apiSend(
    `${DOCUMENTS_API}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/reject`,
    "POST",
    {},
  );
}

export async function listApprovalsQueue() {
  return apiGet<{
    items: Array<ControlledDocumentVersion & { document: ControlledDocument }>;
  }>(`${DOCUMENTS_API}/approvals`);
}

export async function listOverdueReviews() {
  return apiGet<{ items: ControlledDocument[] }>(`${DOCUMENTS_API}/reviews/overdue`);
}

export async function listMyPendingAcks() {
  return apiGet<{
    items: Array<{
      requirementId: string;
      document: ControlledDocument;
      version: ControlledDocumentVersion;
    }>;
  }>(`${DOCUMENTS_API}/acknowledgments/me`);
}

export async function acknowledgeVersions(versionIds: string[]) {
  return apiSend(`${DOCUMENTS_API}/acknowledgments`, "POST", { versionIds });
}

export async function saveDistributions(
  documentId: string,
  distributions: Array<{ scopeType: string; scopeId?: string | null }>,
) {
  return apiSend(`${DOCUMENTS_API}/${encodeURIComponent(documentId)}/distributions`, "PUT", {
    distributions,
  });
}
