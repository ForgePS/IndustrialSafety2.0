import { ForgeError } from "@forge/errors";
import type { Response } from "express";
import type { RequestWithIds } from "./request-ids.js";

/**
 * Optimistic concurrency helpers (ADR-023).
 *
 * Every concurrency-controlled row carries an integer `record_version`. Reads
 * expose it as the weak ETag `W/"<record_version>"`; unsafe updates must send
 * it back in `If-Match`.
 */

export function toETag(recordVersion: number): string {
  return `W/"${recordVersion}"`;
}

/** Accepts `W/"3"`, `"3"` and `3`. Returns null when unparseable. */
export function parseETag(value: string): number | null {
  const trimmed = value.trim().replace(/^W\//i, "").replace(/^"|"$/g, "");
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function setETag(res: Response, recordVersion: number): void {
  res.setHeader("ETag", toETag(recordVersion));
}

/**
 * Reads and validates `If-Match`. `*` matches any existing version.
 * Throws 428 when absent and 400 when present but malformed.
 */
export function requireIfMatch(req: RequestWithIds, resourceType: string): number | "*" {
  const header = req.header("if-match");
  if (!header || header.trim() === "") {
    throw new ForgeError(
      "PRECONDITION_REQUIRED",
      `If-Match is required when updating ${resourceType}`,
    );
  }
  if (header.trim() === "*") {
    return "*";
  }
  const parsed = parseETag(header);
  if (parsed === null) {
    throw new ForgeError("BAD_REQUEST", "If-Match must be a record version ETag");
  }
  return parsed;
}

export interface ConcurrencyConflictContext {
  tenantId: string;
  resourceType: string;
  resourceId: string;
  expectedVersion: number | "*";
  actualVersion: number | null;
}

/**
 * Raised when the row was changed by someone else. The message carries only
 * version numbers, never field values, so conflict logs stay free of payload data.
 */
export function concurrencyConflict(context: ConcurrencyConflictContext): ForgeError {
  return new ForgeError(
    "PRECONDITION_FAILED",
    `${context.resourceType} was modified by another request`,
    {
      details: [
        {
          resourceType: context.resourceType,
          resourceId: context.resourceId,
          expectedVersion: context.expectedVersion,
          actualVersion: context.actualVersion,
        },
      ],
    },
  );
}

/**
 * Asserts an optimistic UPDATE actually matched. `updatedRows` is what the
 * `WHERE id = ... AND record_version = ...` statement returned.
 */
export function assertVersionMatched(
  updatedRows: number,
  currentVersion: number | null,
  context: Omit<ConcurrencyConflictContext, "actualVersion">,
): void {
  if (updatedRows === 0) {
    throw concurrencyConflict({ ...context, actualVersion: currentVersion });
  }
}
