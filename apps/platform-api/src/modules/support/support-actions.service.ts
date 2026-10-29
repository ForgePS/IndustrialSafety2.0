import { Injectable } from "@nestjs/common";
import { createId, withTenantTransaction, type Database } from "@forge/database";
import { Inject } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";

@Injectable()
export class SupportActionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async record(
    tenantId: string,
    input: { actionType: string; summary: string; metadata?: Record<string, unknown> },
    principal: ForgePrincipal,
  ) {
    const id = createId();
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.audit.writeInTransaction(tx, {
          id,
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "support.action",
          resourceType: "support_action",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          metadata: {
            actionType: input.actionType,
            summary: input.summary,
            ...(input.metadata ?? {}),
          },
        });
        return {
          id,
          tenantId,
          actionType: input.actionType,
          summary: input.summary,
          occurredAt: new Date().toISOString(),
        };
      },
      principal.userId,
    );
  }
}
