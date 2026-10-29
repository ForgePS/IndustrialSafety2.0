import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ForgeError, isForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { Observable, from, of, switchMap } from "rxjs";
import { IDEMPOTENT_KEY, type IdempotentOptions } from "./idempotent.decorator.js";
import { IdempotencyService } from "./idempotency.service.js";
import type { RequestWithIds } from "./request-ids.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RequestWithPrincipal = RequestWithIds & { principal?: ForgePrincipal };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const options = this.reflector.getAllAndOverride<IdempotentOptions | undefined>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const res = context.switchToHttp().getResponse<Response>();
    const method = req.method.toUpperCase();
    if (!UNSAFE_METHODS.has(method)) {
      return next.handle();
    }

    const key = req.header("idempotency-key")?.trim();
    if (!key) {
      if (options.required) {
        throw new ForgeError(
          "BAD_REQUEST",
          "Idempotency-Key header is required for this operation",
        );
      }
      return next.handle();
    }
    if (key.length > 255) {
      throw new ForgeError("BAD_REQUEST", "Idempotency-Key must be 255 characters or fewer");
    }

    const principal = req.principal;
    if (!principal) {
      // Only reachable on a @Public() route; there is no scope to key against.
      return next.handle();
    }

    const scope = {
      tenantId: principal.tenantId,
      userId: principal.userId,
      method,
      route: req.path.slice(0, 512),
      key,
    };
    const requestHash = this.idempotency.hashRequest(req.body);

    return from(this.idempotency.claim(scope, requestHash)).pipe(
      switchMap((claim) => {
        if (claim.outcome === "REQUEST_MISMATCH") {
          throw new ForgeError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency-Key was already used with a different request body",
          );
        }
        if (claim.outcome === "IN_PROGRESS") {
          throw new ForgeError(
            "IDEMPOTENCY_IN_PROGRESS",
            "An identical request is still being processed",
          );
        }
        if (claim.outcome === "REPLAY") {
          res.setHeader("Idempotency-Replayed", "true");
          res.status(claim.responseStatus);
          return of(claim.responseBody);
        }

        const recordId = claim.recordId;
        return from(
          (async () => {
            try {
              const body = await lastValueOf(next.handle());
              await this.idempotency.complete(scope.tenantId, recordId, {
                responseStatus: res.statusCode,
                responseBody: body,
                resourceType: options.resourceType,
                resourceId: extractResourceId(body),
              });
              return body;
            } catch (error) {
              const status = isForgeError(error) ? error.statusCode : 500;
              await this.idempotency.markFailed(scope.tenantId, recordId, status);
              throw error;
            }
          })(),
        );
      }),
    );
  }
}

function lastValueOf(source: Observable<unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let latest: unknown;
    let received = false;
    source.subscribe({
      next: (value) => {
        latest = value;
        received = true;
      },
      error: reject,
      complete: () => resolve(received ? latest : undefined),
    });
  });
}

/** Pulls `data.id` out of the standard success envelope, when present. */
function extractResourceId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    return undefined;
  }
  const data = (body as { data: unknown }).data;
  if (typeof data !== "object" || data === null || !("id" in data)) {
    return undefined;
  }
  const id = (data as { id: unknown }).id;
  return typeof id === "string" ? id : undefined;
}
