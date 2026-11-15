import { createCorrelationId } from "@forge/security";
import type { Request } from "express";

export type RequestWithIds = Request & {
  correlationId?: string;
  requestId?: string;
};

export function getRequestIds(req: RequestWithIds): {
  requestId: string;
  correlationId: string;
} {
  const correlationId = req.correlationId ?? createCorrelationId();
  const headerRequestId =
    typeof req.header === "function" ? req.header("x-request-id")?.trim() : undefined;
  const requestId = req.requestId ?? (headerRequestId || createCorrelationId());
  req.correlationId = correlationId;
  req.requestId = requestId;
  return { requestId, correlationId };
}
