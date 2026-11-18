import { Inject, Injectable } from "@nestjs/common";
import {
  authorizationDecisionLog,
  createId,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { createLogger, logOperationalFailure } from "@forge/observability";
import { DATABASE } from "../../tokens.js";

const authzLogger = createLogger({
  service: "platform-api-authz",
  environment: process.env.APP_ENV ?? "local",
});

@Injectable()
export class AuthorizationDecisionService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Persist + log a DENIED authorization decision (MK-S16).
   * Best-effort DB write; structured log always fires. No secrets in context.
   */
  async recordDenial(input: {
    tenantId: string | null | undefined;
    userId: string;
    permissionCode: string;
    resourceType: string;
    resourceId?: string | null;
    reasonCode: string;
    correlationId: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    logOperationalFailure(authzLogger, {
      category: "AUTHORIZATION",
      message: "Authorization denied",
      correlationId: input.correlationId,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      code: input.reasonCode,
      fields: {
        permissionCode: input.permissionCode,
        resourceType: input.resourceType,
        userId: input.userId,
      },
    });

    if (!input.tenantId) {
      return;
    }

    try {
      await withTenantTransaction(
        this.db,
        input.tenantId,
        async (tx) => {
          await tx.insert(authorizationDecisionLog).values({
            id: createId(),
            tenantId: input.tenantId!,
            userId: input.userId,
            permissionCode: input.permissionCode,
            resourceType: input.resourceType,
            resourceId: input.resourceId ?? null,
            decision: "DENIED",
            reasonCode: input.reasonCode,
            contextJson: input.context ?? {},
            correlationId: input.correlationId,
          });
        },
        input.userId,
      );
    } catch {
      // Do not fail the request path if decision logging fails.
      authzLogger.warn("authorization_decision_log insert failed", {
        errorCategory: "AUTHORIZATION",
        correlationId: input.correlationId,
        tenantId: input.tenantId,
      });
    }
  }
}
