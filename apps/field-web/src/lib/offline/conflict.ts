/**
 * Field offline conflict policy (Phase 10).
 * Queued mutations are never silently applied against newer or locked server state.
 */

export type ConflictStrategy =
  | "SERVER_WINS"
  | "CLIENT_REVIEW_REQUIRED"
  | "REJECT_STALE_WRITE";

export type ConflictDecision = {
  strategy: ConflictStrategy;
  autoApply: boolean;
  reason: string;
};

export type ConflictInput = {
  domain: string;
  operation: "create" | "update" | "delete";
  baseVersion: number | null;
  serverVersion: number | null;
  serverApproved?: boolean;
};

const REVIEW_REQUIRED_DOMAINS = new Set([
  "industrial.inspections",
  "industrial.forms.submissions",
  "industrial.sanitation",
]);

const APPROVAL_LOCKED_DOMAINS = new Set([
  "industrial.loto.procedures",
  "industrial.emergency_response",
]);

export function resolveConflict(input: ConflictInput): ConflictDecision {
  if (input.serverApproved && APPROVAL_LOCKED_DOMAINS.has(input.domain)) {
    return {
      strategy: "REJECT_STALE_WRITE",
      autoApply: false,
      reason:
        "The record is in an approved or locked state. Offline edits are refused; redo against live data.",
    };
  }

  if (input.serverVersion === null) {
    if (input.operation === "create") {
      return {
        strategy: "SERVER_WINS",
        autoApply: true,
        reason: "New record with no server counterpart.",
      };
    }
    return {
      strategy: "REJECT_STALE_WRITE",
      autoApply: false,
      reason: "The target record no longer exists on the server.",
    };
  }

  if (input.operation === "create") {
    return {
      strategy: "CLIENT_REVIEW_REQUIRED",
      autoApply: false,
      reason: "A matching server record already exists for this queued create.",
    };
  }

  if (input.baseVersion === null) {
    return {
      strategy: "CLIENT_REVIEW_REQUIRED",
      autoApply: false,
      reason: "The queued mutation has no base version to compare against.",
    };
  }

  if (input.baseVersion === input.serverVersion) {
    return {
      strategy: "SERVER_WINS",
      autoApply: true,
      reason: "No concurrent server change since the mutation was queued.",
    };
  }

  if (APPROVAL_LOCKED_DOMAINS.has(input.domain)) {
    return {
      strategy: "REJECT_STALE_WRITE",
      autoApply: false,
      reason: "The record changed on the server while the mutation was queued.",
    };
  }

  if (REVIEW_REQUIRED_DOMAINS.has(input.domain)) {
    return {
      strategy: "CLIENT_REVIEW_REQUIRED",
      autoApply: false,
      reason: "Safety record changed on the server; a person must reconcile the two versions.",
    };
  }

  return {
    strategy: "SERVER_WINS",
    autoApply: false,
    reason: "Server state is newer. The queued value is discarded and reported to the user.",
  };
}
