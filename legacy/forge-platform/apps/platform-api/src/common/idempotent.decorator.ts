import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_KEY = "forgeIdempotent";

export interface IdempotentOptions {
  /** Recorded on the idempotency row so replays can be traced to a resource. */
  resourceType: string;
  /** Reject the request when the client omits `Idempotency-Key`. */
  required?: boolean;
}

/**
 * Marks a mutation as idempotency-aware (ADR-022). When the client sends an
 * `Idempotency-Key`, a retry with the same body replays the original response
 * and a retry with a different body is rejected.
 */
export const Idempotent = (options: IdempotentOptions) => SetMetadata(IDEMPOTENT_KEY, options);
