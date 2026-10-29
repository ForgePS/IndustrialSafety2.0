import { DOMAIN_EVENT_TYPES } from "@forge/events";
import { tenants, withTenantTransaction } from "@forge/database";
import { eq } from "drizzle-orm";
import { registerDomainEventHandler } from "./registry.js";

function registerProofHandler(eventType: string, handlerName: string, action: string): void {
  registerDomainEventHandler(eventType, handlerName, async ({ db, event, logger }) => {
    if (!event.tenantId) {
      throw new Error(`Proof handler ${handlerName} requires tenantId`);
    }

    await withTenantTransaction(db, event.tenantId, async (tx) => {
      if (eventType === DOMAIN_EVENT_TYPES.TENANT_CREATED) {
        const rows = await tx
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.id, event.aggregateId))
          .limit(1);
        if (rows.length === 0) {
          throw new Error(`Tenant aggregate not found: ${event.aggregateId}`);
        }
      }

      logger.info("proof handler completed", {
        eventId: event.id,
        handlerName,
        action,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
      });
    });
  });
}

export function registerProofEventHandlers(): void {
  registerProofHandler(
    DOMAIN_EVENT_TYPES.TENANT_CREATED,
    "proof.tenant-created",
    "verify-tenant-exists",
  );
  registerProofHandler(
    DOMAIN_EVENT_TYPES.USER_INVITATION_CREATED,
    "proof.user-invitation-created",
    "record-invitation-created",
  );
  registerProofHandler(
    DOMAIN_EVENT_TYPES.MEMBERSHIP_ACTIVATED,
    "proof.membership-activated",
    "record-membership-activated",
  );
  registerProofHandler(
    DOMAIN_EVENT_TYPES.SUBSCRIPTION_CHANGED,
    "proof.subscription-changed",
    "record-subscription-changed",
  );
  registerProofHandler(
    DOMAIN_EVENT_TYPES.FEATURE_CHANGED,
    "proof.feature-changed",
    "record-feature-changed",
  );
}
