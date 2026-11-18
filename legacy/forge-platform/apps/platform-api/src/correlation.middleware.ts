import type { NextFunction, Request, Response } from "express";
import { createCorrelationId } from "@forge/security";

export class CorrelationIdMiddleware {
  use(req: Request & { correlationId?: string }, res: Response, next: NextFunction): void {
    const incoming = req.header("x-correlation-id");
    const correlationId = incoming && incoming.trim() ? incoming.trim() : createCorrelationId();
    req.correlationId = correlationId;
    res.setHeader("x-correlation-id", correlationId);
    next();
  }
}
