import { createHash } from "node:crypto";

/** Canonical SHA-256 of stored legal/attestation content. */
export function hashCanonicalContent(content: string): string {
  return createHash("sha256").update(content.trim(), "utf8").digest("hex");
}

export type RequirementRow = {
  requirementId: string;
  documentId: string;
  documentVersionId: string;
  documentKey: string;
  documentTitle: string;
  documentType: string;
  version: string;
  versionNumber: number;
  contentHash: string;
  effectiveAt: Date;
  blockingMode: string;
  requiredBy: Date | null;
  tenantId: string | null;
};

export type AcceptanceRow = {
  documentVersionId: string;
  status: string;
};

export type PendingRequirement = RequirementRow & {
  status: "ACTION_REQUIRED" | "OVERDUE";
};

/**
 * Pure evaluator: which required versions still need acknowledgment.
 * Ignores acknowledgments that are not ACKNOWLEDGED (revoked via events is handled by status).
 */
export function evaluatePendingRequirements(input: {
  requirements: RequirementRow[];
  acceptances: AcceptanceRow[];
  now?: Date;
}): PendingRequirement[] {
  const now = input.now ?? new Date();
  const accepted = new Set(
    input.acceptances
      .filter((a) => a.status === "ACKNOWLEDGED")
      .map((a) => a.documentVersionId),
  );
  const pending: PendingRequirement[] = [];
  for (const req of input.requirements) {
    if (accepted.has(req.documentVersionId)) continue;
    if (req.requiredBy && req.requiredBy.getTime() < now.getTime()) {
      pending.push({ ...req, status: "OVERDUE" });
    } else {
      pending.push({ ...req, status: "ACTION_REQUIRED" });
    }
  }
  return pending;
}

export function hasBlockingOutstanding(pending: PendingRequirement[]): boolean {
  return pending.some((p) => p.blockingMode === "BLOCKING");
}
