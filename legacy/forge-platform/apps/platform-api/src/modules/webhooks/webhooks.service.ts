import { Inject, Injectable } from "@nestjs/common";
import {
  createWebhookDeliveryInputSchema,
  createWebhookEndpointInputSchema,
  patchWebhookEndpointInputSchema,
} from "@forge/contracts";
import {
  createId,
  tenantWebhookDeliveries,
  tenantWebhookEndpoints,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { generateWebhookSigningSecret, redactSensitive, signWebhookPayload } from "@forge/security";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq } from "drizzle-orm";
import { createLogger, logOperationalFailure } from "@forge/observability";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";

const opsLogger = createLogger({
  service: "platform-api-webhooks",
  environment: process.env.APP_ENV ?? "local",
});

export type WebhookHttpResult = {
  ok: boolean;
  status: number;
  bodyPreview: string;
};

export type WebhookHttpPoster = (input: {
  url: string;
  body: string;
  signatureHeader: string;
  eventType: string;
}) => Promise<WebhookHttpResult>;

async function defaultHttpPoster(input: {
  url: string;
  body: string;
  signatureHeader: string;
  eventType: string;
}): Promise<WebhookHttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-signature": input.signatureHeader,
        "x-forge-event": input.eventType,
      },
      body: input.body,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      bodyPreview: text.slice(0, 500),
    };
  } finally {
    clearTimeout(timer);
  }
}

function toPublicEndpoint(
  row: typeof tenantWebhookEndpoints.$inferSelect,
  opts?: { includeSecret?: boolean; signingSecret?: string },
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    endpointUrl: row.endpointUrl,
    eventTypes: (row.eventTypesJson as string[]) ?? [],
    enabled: row.enabled,
    createdByUserId: row.createdByUserId,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(opts?.includeSecret ? { signingSecret: opts.signingSecret ?? row.signingSecret } : {}),
  };
}

function toPublicDelivery(row: typeof tenantWebhookDeliveries.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    endpointId: row.endpointId,
    eventType: row.eventType,
    payload: (row.payloadJson as Record<string, unknown>) ?? {},
    status: row.status,
    attemptCount: row.attemptCount,
    httpStatus: row.httpStatus,
    durationMs: row.durationMs,
    responseBodyPreview: row.responseBodyPreview,
    errorMessage: row.errorMessage,
    lastAttemptAt: row.lastAttemptAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class WebhooksService {
  private httpPoster: WebhookHttpPoster = defaultHttpPoster;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Test-only override to avoid live HTTP. */
  setHttpPosterForTests(poster: WebhookHttpPoster) {
    this.httpPoster = poster;
  }

  async listEndpoints(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx.query.tenantWebhookEndpoints.findMany({
        where: eq(tenantWebhookEndpoints.tenantId, tenantId),
        orderBy: [desc(tenantWebhookEndpoints.createdAt)],
      });
      return rows.map((r) => toPublicEndpoint(r));
    });
  }

  async createEndpoint(tenantId: string, input: unknown, principal: ForgePrincipal) {
    this.assertTenant(tenantId, principal);
    const data = createWebhookEndpointInputSchema.parse(input);
    if (
      !data.endpointUrl.startsWith("https://") &&
      !data.endpointUrl.startsWith("http://localhost")
    ) {
      throw new ForgeError(
        "BAD_REQUEST",
        "Webhook endpoint URL must be https (or localhost for labs)",
      );
    }

    const signingSecret = generateWebhookSigningSecret();
    void redactSensitive({ signingSecret, secret: signingSecret });

    const id = createId();
    const now = new Date();
    const row = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [inserted] = await tx
          .insert(tenantWebhookEndpoints)
          .values({
            id,
            tenantId,
            name: data.name,
            endpointUrl: data.endpointUrl,
            eventTypesJson: data.eventTypes,
            signingSecret,
            enabled: data.enabled ?? true,
            createdByUserId: principal.userId,
            disabledAt: data.enabled === false ? now : null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (inserted) {
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "webhook.endpoint.changed",
            resourceType: "tenant_webhook_endpoint",
            resourceId: inserted.id,
            result: "SUCCESS",
            riskLevel: "HIGH",
            correlationId: principal.correlationId,
            requestId: principal.requestId,
            metadata: { change: "create" },
            after: toPublicEndpoint(inserted),
          });
        }
        return inserted;
      },
      principal.userId,
    );

    if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create webhook endpoint");
    return toPublicEndpoint(row, { includeSecret: true, signingSecret });
  }

  async patchEndpoint(
    tenantId: string,
    endpointId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    this.assertTenant(tenantId, principal);
    const data = patchWebhookEndpointInputSchema.parse(input);

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const existing = await tx.query.tenantWebhookEndpoints.findFirst({
          where: and(
            eq(tenantWebhookEndpoints.id, endpointId),
            eq(tenantWebhookEndpoints.tenantId, tenantId),
          ),
        });
        if (!existing) throw new ForgeError("NOT_FOUND", "Webhook endpoint not found");

        const now = new Date();
        let nextSecret = existing.signingSecret;
        let includeSecret = false;
        if (data.rotateSecret) {
          nextSecret = generateWebhookSigningSecret();
          includeSecret = true;
          void redactSensitive({ signingSecret: nextSecret });
        }

        if (data.endpointUrl) {
          if (
            !data.endpointUrl.startsWith("https://") &&
            !data.endpointUrl.startsWith("http://localhost")
          ) {
            throw new ForgeError(
              "BAD_REQUEST",
              "Webhook endpoint URL must be https (or localhost for labs)",
            );
          }
        }

        const enabled = data.enabled ?? existing.enabled;
        const [updated] = await tx
          .update(tenantWebhookEndpoints)
          .set({
            name: data.name ?? existing.name,
            endpointUrl: data.endpointUrl ?? existing.endpointUrl,
            eventTypesJson: data.eventTypes ?? existing.eventTypesJson,
            signingSecret: nextSecret,
            enabled,
            disabledAt: enabled ? null : (existing.disabledAt ?? now),
            updatedAt: now,
          })
          .where(
            and(
              eq(tenantWebhookEndpoints.id, endpointId),
              eq(tenantWebhookEndpoints.tenantId, tenantId),
            ),
          )
          .returning();

        const row = updated ?? existing;
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "webhook.endpoint.changed",
          resourceType: "tenant_webhook_endpoint",
          resourceId: row.id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          metadata: {
            change: "patch",
            rotateSecret: Boolean(data.rotateSecret),
            enabled,
          },
          after: toPublicEndpoint(row),
        });

        return toPublicEndpoint(row, {
          includeSecret,
          signingSecret: nextSecret,
        });
      },
      principal.userId,
    );
  }

  async listDeliveries(tenantId: string, endpointId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const endpoint = await tx.query.tenantWebhookEndpoints.findFirst({
        where: and(
          eq(tenantWebhookEndpoints.id, endpointId),
          eq(tenantWebhookEndpoints.tenantId, tenantId),
        ),
      });
      if (!endpoint) throw new ForgeError("NOT_FOUND", "Webhook endpoint not found");

      const rows = await tx.query.tenantWebhookDeliveries.findMany({
        where: and(
          eq(tenantWebhookDeliveries.endpointId, endpointId),
          eq(tenantWebhookDeliveries.tenantId, tenantId),
        ),
        orderBy: [desc(tenantWebhookDeliveries.createdAt)],
        limit: 100,
      });
      return rows.map(toPublicDelivery);
    });
  }

  async createDelivery(
    tenantId: string,
    endpointId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    this.assertTenant(tenantId, principal);
    const data = createWebhookDeliveryInputSchema.parse(input);

    const endpoint = await withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.tenantWebhookEndpoints.findFirst({
        where: and(
          eq(tenantWebhookEndpoints.id, endpointId),
          eq(tenantWebhookEndpoints.tenantId, tenantId),
        ),
      });
    });
    if (!endpoint) throw new ForgeError("NOT_FOUND", "Webhook endpoint not found");
    if (!endpoint.enabled) {
      throw new ForgeError("CONFLICT", "Webhook endpoint is disabled");
    }

    const eventTypes = (endpoint.eventTypesJson as string[]) ?? [];
    if (
      eventTypes.length > 0 &&
      !eventTypes.includes(data.eventType) &&
      !eventTypes.includes("*")
    ) {
      throw new ForgeError("BAD_REQUEST", "Event type is not subscribed on this endpoint");
    }

    const deliveryId = createId();
    const now = new Date();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx.insert(tenantWebhookDeliveries).values({
        id: deliveryId,
        tenantId,
        endpointId,
        eventType: data.eventType,
        payloadJson: data.payload,
        status: "PENDING",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    return this.attemptDelivery(tenantId, endpoint, deliveryId, data.eventType, data.payload);
  }

  async replayDelivery(
    tenantId: string,
    endpointId: string,
    deliveryId: string,
    principal: ForgePrincipal,
  ) {
    this.assertTenant(tenantId, principal);

    const { endpoint, delivery } = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const ep = await tx.query.tenantWebhookEndpoints.findFirst({
        where: and(
          eq(tenantWebhookEndpoints.id, endpointId),
          eq(tenantWebhookEndpoints.tenantId, tenantId),
        ),
      });
      const del = await tx.query.tenantWebhookDeliveries.findFirst({
        where: and(
          eq(tenantWebhookDeliveries.id, deliveryId),
          eq(tenantWebhookDeliveries.endpointId, endpointId),
          eq(tenantWebhookDeliveries.tenantId, tenantId),
        ),
      });
      return { endpoint: ep, delivery: del };
    });

    if (!endpoint) throw new ForgeError("NOT_FOUND", "Webhook endpoint not found");
    if (!delivery) throw new ForgeError("NOT_FOUND", "Webhook delivery not found");
    if (!endpoint.enabled) {
      throw new ForgeError("CONFLICT", "Webhook endpoint is disabled");
    }

    return this.attemptDelivery(
      tenantId,
      endpoint,
      delivery.id,
      delivery.eventType,
      (delivery.payloadJson as Record<string, unknown>) ?? {},
    );
  }

  private async attemptDelivery(
    tenantId: string,
    endpoint: typeof tenantWebhookEndpoints.$inferSelect,
    deliveryId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const body = JSON.stringify({
      id: deliveryId,
      type: eventType,
      tenantId,
      data: payload,
    });
    const signatureHeader = signWebhookPayload(body, endpoint.signingSecret);
    const started = Date.now();

    let result: WebhookHttpResult;
    let errorMessage: string | null = null;
    try {
      result = await this.httpPoster({
        url: endpoint.endpointUrl,
        body,
        signatureHeader,
        eventType,
      });
    } catch (err) {
      result = { ok: false, status: 0, bodyPreview: "" };
      errorMessage = err instanceof Error ? err.message : "Delivery failed";
    }

    const durationMs = Date.now() - started;
    const status = result.ok ? "SUCCEEDED" : "FAILED";
    const now = new Date();

    if (!result.ok) {
      logOperationalFailure(opsLogger, {
        category: "WEBHOOK",
        message: "Outbound webhook delivery failed",
        tenantId,
        code: "WEBHOOK_DELIVERY_FAILED",
        fields: {
          endpointId: endpoint.id,
          deliveryId,
          eventType,
          httpStatus: result.status,
          durationMs,
          // Do not log signing secret or full payload
        },
      });
    }

    const updated = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const current = await tx.query.tenantWebhookDeliveries.findFirst({
        where: and(
          eq(tenantWebhookDeliveries.id, deliveryId),
          eq(tenantWebhookDeliveries.tenantId, tenantId),
        ),
      });
      const attemptCount = (current?.attemptCount ?? 0) + 1;
      const [row] = await tx
        .update(tenantWebhookDeliveries)
        .set({
          status,
          attemptCount,
          httpStatus: result.status || null,
          durationMs,
          responseBodyPreview: result.bodyPreview || null,
          errorMessage,
          lastAttemptAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(tenantWebhookDeliveries.id, deliveryId),
            eq(tenantWebhookDeliveries.tenantId, tenantId),
          ),
        )
        .returning();
      return row;
    });

    return toPublicDelivery(
      updated ?? {
        id: deliveryId,
        tenantId,
        endpointId: endpoint.id,
        eventType,
        payloadJson: payload,
        status,
        attemptCount: 1,
        httpStatus: result.status || null,
        durationMs,
        responseBodyPreview: result.bodyPreview || null,
        errorMessage,
        lastAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      },
    );
  }

  private assertTenant(tenantId: string, principal: ForgePrincipal) {
    if (!principal.isPlatformAdmin && principal.tenantId !== tenantId) {
      throw new ForgeError("FORBIDDEN", "Cannot manage webhooks for another tenant");
    }
  }
}
