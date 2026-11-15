/**
 * IND-10 conflict resolution policy.
 *
 * A queued mutation that was authored against an older server version is never
 * silently applied. Each domain declares how a stale write is handled, and
 * approved-state safety records reject the write outright.
 */

export type ConflictStrategy =
  /** Server state wins; the queued write is discarded and the user is told. */
  | "SERVER_WINS"
  /** A human must compare both versions before anything is written. */
  | "CLIENT_REVIEW_REQUIRED"
  /** The write is refused permanently; the user must redo it against live data. */
  | "REJECT_STALE_WRITE";

export type ConflictDecision = {
  strategy: ConflictStrategy;
  /** True only when the client payload may be written without human review. */
  autoApply: boolean;
  reason: string;
};

export type ConflictInput = {
  domain: string;
  operation: "create" | "update" | "delete";
  /** Version the client authored against. Null for creates. */
  baseVersion: number | null;
  /** Current server version, or null when the record no longer exists. */
  serverVersion: number | null;
  /**
   * Whether the target record is in an approved/locked safety state
   * (for example an APPROVED or ACTIVE LOTO procedure).
   */
  serverApproved?: boolean;
};

/** Domains where a stale write must never be merged automatically. */
const REVIEW_REQUIRED_DOMAINS = new Set([
  "industrial.inspections",
  "industrial.forms.submissions",
  "industrial.jsas",
  "industrial.confined_space",
  "industrial.hot_work",
]);

/** Domains where an approved record can only be changed online. */
const APPROVAL_LOCKED_DOMAINS = new Set([
  "industrial.loto.procedures",
  "industrial.loto.revisions",
  "industrial.loto.approvals",
]);

export function resolveConflict(input: ConflictInput): ConflictDecision {
  // Approved safety state is authoritative: a queued edit against it is refused
  // rather than merged, so an offline device can never overwrite an approval.
  if (input.serverApproved && APPROVAL_LOCKED_DOMAINS.has(input.domain)) {
    return {
      strategy: "REJECT_STALE_WRITE",
      autoApply: false,
      reason:
        "The procedure is in an approved state. Offline edits are refused; reauthor the change against live data.",
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
      reason: "LOTO records changed on the server while the mutation was queued.",
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
