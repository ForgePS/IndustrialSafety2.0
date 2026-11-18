import type { NestMiddleware } from "@nestjs/common";
import { ForgeError } from "@forge/errors";
import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

/**
 * In-memory sliding-window rate limiter for important mutations.
 * Suitable for single-task development; replace with Redis/API GW for multi-AZ prod.
 */
export class RateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly options: {
      windowMs: number;
      max: number;
      keyFn?: (req: Request) => string;
    } = { windowMs: 60_000, max: 60 },
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      next();
      return;
    }

    const keyFn =
      this.options.keyFn ??
      ((r: Request) => {
        const auth = r.header("authorization") ?? r.header("x-forge-dev-principal") ?? "anon";
        return `${r.ip}:${auth.slice(0, 64)}:${r.path}`;
      });
    const key = keyFn(req);
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.options.windowMs });
      next();
      return;
    }
    existing.count += 1;
    if (existing.count > this.options.max) {
      throw new ForgeError("RATE_LIMITED", "Too many requests — retry shortly");
    }
    next();
  }
}
