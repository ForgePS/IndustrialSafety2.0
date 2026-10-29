import { Inject, Injectable } from "@nestjs/common";
import { API_KEY_PREFIX, createApiKeyInputSchema, type CreateApiKeyInput } from "@forge/contracts";
import { createId, tenantApiKeys, withTenantTransaction, type Database } from "@forge/database";
import { ForgeError } from "@forge/errors";
import { generateApiKey, redactSensitive } from "@forge/security";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";

function toPublicKey(row: typeof tenantApiKeys.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    displayHint: row.displayHint,
    scopes: (row.scopesJson as string[]) ?? [],
    createdByUserId: row.createdByUserId,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx.query.tenantApiKeys.findMany({
        where: eq(tenantApiKeys.tenantId, tenantId),
        orderBy: [desc(tenantApiKeys.createdAt)],
      });
      return rows.map(toPublicKey);
    });
  }

  async create(tenantId: string, input: unknown, principal: ForgePrincipal) {
    if (!principal.isPlatformAdmin && principal.tenantId !== tenantId) {
      throw new ForgeError("FORBIDDEN", "Cannot create API keys for another tenant");
    }

    const data: CreateApiKeyInput = createApiKeyInputSchema.parse(input);
    const generated = generateApiKey({ prefix: API_KEY_PREFIX });

    // Never log rawKey — redaction is belt-and-suspenders if callers log this object.
    void redactSensitive({ rawKey: generated.rawKey, apiKey: generated.rawKey });

    const id = createId();
    const now = new Date();

    const row = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [inserted] = await tx
          .insert(tenantApiKeys)
          .values({
            id,
            tenantId,
            name: data.name,
            keyPrefix: generated.prefix,
            displayHint: generated.displayHint,
            keyHash: generated.keyHash,
            scopesJson: data.scopes,
            createdByUserId: principal.userId,
            expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
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
            action: "api_key.create",
            resourceType: "tenant_api_key",
            resourceId: inserted.id,
            result: "SUCCESS",
            riskLevel: "HIGH",
            correlationId: principal.correlationId,
            requestId: principal.requestId,
            after: toPublicKey(inserted),
          });
        }
        return inserted;
      },
      principal.userId,
    );

    if (!row) {
      throw new ForgeError("INTERNAL_ERROR", "Failed to create API key");
    }

    return {
      ...toPublicKey(row),
      /** Shown once; never persisted. */
      apiKey: generated.rawKey,
    };
  }

  async revoke(tenantId: string, keyId: string, principal: ForgePrincipal) {
    if (!principal.isPlatformAdmin && principal.tenantId !== tenantId) {
      throw new ForgeError("FORBIDDEN", "Cannot revoke API keys for another tenant");
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const existing = await tx.query.tenantApiKeys.findFirst({
          where: and(eq(tenantApiKeys.id, keyId), eq(tenantApiKeys.tenantId, tenantId)),
        });
        if (!existing) {
          throw new ForgeError("NOT_FOUND", "API key not found");
        }
        if (existing.revokedAt) {
          return toPublicKey(existing);
        }
        const now = new Date();
        const [updated] = await tx
          .update(tenantApiKeys)
          .set({ revokedAt: now, updatedAt: now })
          .where(
            and(
              eq(tenantApiKeys.id, keyId),
              eq(tenantApiKeys.tenantId, tenantId),
              isNull(tenantApiKeys.revokedAt),
            ),
          )
          .returning();
        const row = updated ?? existing;
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "api_key.revoke",
          resourceType: "tenant_api_key",
          resourceId: row.id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: toPublicKey(row),
        });
        return toPublicKey(row);
      },
      principal.userId,
    );
  }
}
