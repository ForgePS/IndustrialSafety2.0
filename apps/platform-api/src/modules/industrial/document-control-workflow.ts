/** Pure Document Control workflow helpers (unit-tested). */

export const DOC_WORKFLOW = {
  DRAFT: "DRAFT",
  IN_REVIEW: "IN_REVIEW",
  PUBLISHED: "PUBLISHED",
  OBSOLETE: "OBSOLETE",
} as const;

export const VERSION_WORKFLOW = {
  DRAFT: "DRAFT",
  IN_REVIEW: "IN_REVIEW",
  APPROVED: "APPROVED",
  SUPERSEDED: "SUPERSEDED",
} as const;

export type DocWorkflowStatus = (typeof DOC_WORKFLOW)[keyof typeof DOC_WORKFLOW];
export type VersionWorkflowStatus = (typeof VERSION_WORKFLOW)[keyof typeof VERSION_WORKFLOW];

export const DISTRIBUTION_SCOPE = {
  TENANT: "TENANT",
  SITE: "SITE",
  DEPARTMENT: "DEPARTMENT",
  ROLE: "ROLE",
} as const;

export type DistributionScopeType = (typeof DISTRIBUTION_SCOPE)[keyof typeof DISTRIBUTION_SCOPE];

export function normalizeDocWorkflow(raw: string | null | undefined): DocWorkflowStatus {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (v === DOC_WORKFLOW.IN_REVIEW) return DOC_WORKFLOW.IN_REVIEW;
  if (v === DOC_WORKFLOW.PUBLISHED || v === "ACTIVE" || v === "APPROVED") {
    return DOC_WORKFLOW.PUBLISHED;
  }
  if (v === DOC_WORKFLOW.OBSOLETE || v === "ARCHIVED") return DOC_WORKFLOW.OBSOLETE;
  return DOC_WORKFLOW.DRAFT;
}

export function canSubmitVersionForReview(versionStatus: string, docStatus: string): boolean {
  return (
    versionStatus === VERSION_WORKFLOW.DRAFT &&
    (docStatus === DOC_WORKFLOW.DRAFT ||
      docStatus === DOC_WORKFLOW.PUBLISHED ||
      docStatus === DOC_WORKFLOW.IN_REVIEW)
  );
}

export function canApproveVersion(versionStatus: string): boolean {
  return versionStatus === VERSION_WORKFLOW.IN_REVIEW;
}

export function canRejectVersion(versionStatus: string): boolean {
  return versionStatus === VERSION_WORKFLOW.IN_REVIEW;
}

export function canObsoleteDocument(docStatus: string): boolean {
  return docStatus === DOC_WORKFLOW.PUBLISHED || docStatus === DOC_WORKFLOW.IN_REVIEW;
}

export function isReviewOverdue(
  reviewDueAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!reviewDueAt) return false;
  const due = reviewDueAt instanceof Date ? reviewDueAt : new Date(reviewDueAt);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}

export function isReviewDueSoon(
  reviewDueAt: Date | string | null | undefined,
  withinDays = 30,
  now = new Date(),
): boolean {
  if (!reviewDueAt) return false;
  const due = reviewDueAt instanceof Date ? reviewDueAt : new Date(reviewDueAt);
  if (Number.isNaN(due.getTime())) return false;
  const ms = due.getTime() - now.getTime();
  return ms >= 0 && ms <= withinDays * 24 * 60 * 60 * 1000;
}

export function matchesDistributionScope(
  scopes: Array<{ scopeType: string; scopeId: string | null; enabled: boolean }>,
  context: {
    siteId?: string | null;
    departmentId?: string | null;
    roleIds?: string[];
  },
): boolean {
  const enabled = scopes.filter((s) => s.enabled);
  if (!enabled.length) return true; // no distributions → visible to tenant viewers
  if (enabled.some((s) => s.scopeType === DISTRIBUTION_SCOPE.TENANT)) return true;
  const site = context.siteId?.trim() || "";
  if (site && enabled.some((s) => s.scopeType === DISTRIBUTION_SCOPE.SITE && s.scopeId === site)) {
    return true;
  }
  const dept = context.departmentId?.trim() || "";
  if (
    dept &&
    enabled.some((s) => s.scopeType === DISTRIBUTION_SCOPE.DEPARTMENT && s.scopeId === dept)
  ) {
    return true;
  }
  const roles = new Set((context.roleIds ?? []).map((r) => r.trim()).filter(Boolean));
  if (
    roles.size &&
    enabled.some(
      (s) => s.scopeType === DISTRIBUTION_SCOPE.ROLE && s.scopeId && roles.has(s.scopeId),
    )
  ) {
    return true;
  }
  return false;
}

export function documentLibraryFilterMatch(
  row: { name: string; category: string | null; workflowStatus: string; siteId: string | null },
  filters: { q?: string; category?: string; workflowStatus?: string; siteId?: string },
): boolean {
  const q = (filters.q ?? "").trim().toLowerCase();
  if (q && !row.name.toLowerCase().includes(q) && !(row.category ?? "").toLowerCase().includes(q)) {
    return false;
  }
  const cat = (filters.category ?? "").trim();
  if (cat && (row.category ?? "") !== cat) return false;
  const wf = (filters.workflowStatus ?? "").trim().toUpperCase();
  if (wf && normalizeDocWorkflow(row.workflowStatus) !== normalizeDocWorkflow(wf)) return false;
  const site = (filters.siteId ?? "").trim();
  if (site && (row.siteId ?? "") !== site) return false;
  return true;
}
