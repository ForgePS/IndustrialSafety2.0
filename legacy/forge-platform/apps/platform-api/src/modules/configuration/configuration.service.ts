import { Inject, Injectable } from "@nestjs/common";
import {
  assertTransition,
  comparePayloads,
  CONFIG_NAMESPACE_LABELS,
  CONFIG_NAMESPACES,
  DEFAULT_PAYLOADS,
  hashConfigPayload,
  isConfigNamespace,
  resolveEffectiveVersion,
  TENANT_ADMIN_NAMESPACES,
  validateConfigPayload,
  type ConfigNamespace,
  type ConfigVersionState,
} from "@forge/configuration";
import type { DatabaseTransaction } from "@forge/database";
import {
  configObjects,
  configVersions,
  createId,
  tenantSettings,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { CONFIG_METRICS, emitConfigMetric, isRlsDenialError } from "./configuration-metrics.js";

const putSchema = z.object({
  value: z.unknown(),
  isSensitive: z.boolean().optional(),
  schemaVersion: z.number().int().positive().optional(),
});

const createDraftSchema = z.object({
  objectKey: z.string().min(1).max(120).default("default"),
  displayName: z.string().min(1).max(200).optional(),
  payload: z.unknown(),
  changeSummary: z.string().max(2000).optional(),
});

const patchDraftSchema = z.object({
  payload: z.unknown(),
  changeSummary: z.string().max(2000).optional(),
  displayName: z.string().min(1).max(200).optional(),
});

const scheduleSchema = z.object({
  effectiveFrom: z.string().datetime(),
  changeSummary: z.string().max(2000).optional(),
});

const importBundleSchema = z.object({
  format: z.literal("forge.config.bundle.v1"),
  dryRun: z.boolean().optional(),
  objects: z.array(
    z.object({
      namespace: z.string(),
      objectKey: z.string(),
      displayName: z.string().optional(),
    }),
  ),
  versions: z.array(
    z.object({
      namespace: z.string().optional(),
      objectKey: z.string().optional(),
      payloadJson: z.unknown(),
      changeSummary: z.string().optional(),
    }),
  ),
});

function canUpdateConfig(principal: ForgePrincipal): boolean {
  return (
    principal.isPlatformAdmin ||
    principal.permissions.has("platform.configuration.update") ||
    principal.permissions.has("tenant.configuration.update")
  );
}

function canPublishConfig(principal: ForgePrincipal): boolean {
  return (
    principal.isPlatformAdmin ||
    principal.permissions.has("platform.configuration.publish") ||
    principal.permissions.has("tenant.configuration.publish")
  );
}

function canReadConfig(principal: ForgePrincipal): boolean {
  return (
    canUpdateConfig(principal) ||
    canPublishConfig(principal) ||
    principal.permissions.has("platform.audit.read")
  );
}

function isCreatorPrincipal(principal: ForgePrincipal): boolean {
  return (
    principal.isPlatformAdmin ||
    principal.permissions.has("platform.configuration.update") ||
    principal.permissions.has("platform.configuration.publish")
  );
}

function denyAuthorization(message: string): never {
  emitConfigMetric(CONFIG_METRICS.AuthorizationDenials);
  throw new ForgeError("FORBIDDEN", message);
}

function assertNamespaceReadAccess(principal: ForgePrincipal, namespace: ConfigNamespace) {
  if (!canReadConfig(principal)) {
    denyAuthorization("Missing configuration permission");
  }
  if (
    !isCreatorPrincipal(principal) &&
    !principal.permissions.has("platform.audit.read") &&
    !TENANT_ADMIN_NAMESPACES.includes(namespace)
  ) {
    denyAuthorization(`Tenant admin cannot manage namespace ${namespace}`);
  }
}

function assertNamespaceWriteAccess(principal: ForgePrincipal, namespace: ConfigNamespace) {
  if (!canUpdateConfig(principal)) {
    denyAuthorization("Missing configuration permission");
  }
  if (!isCreatorPrincipal(principal) && !TENANT_ADMIN_NAMESPACES.includes(namespace)) {
    denyAuthorization(`Tenant admin cannot manage namespace ${namespace}`);
  }
}

function assertNamespacePublishAccess(principal: ForgePrincipal, namespace: ConfigNamespace) {
  if (!canPublishConfig(principal)) {
    denyAuthorization("Missing configuration publish permission");
  }
  if (!isCreatorPrincipal(principal) && !TENANT_ADMIN_NAMESPACES.includes(namespace)) {
    denyAuthorization(`Tenant admin cannot manage namespace ${namespace}`);
  }
}

function rethrowConfigDbError(error: unknown): never {
  if (isRlsDenialError(error)) {
    emitConfigMetric(CONFIG_METRICS.RlsDenials);
  }
  throw error;
}

@Injectable()
export class ConfigurationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async listAll(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.tenantSettings.findMany({
        where: eq(tenantSettings.tenantId, tenantId),
      });
    });
  }

  async listNamespace(tenantId: string, namespace: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.tenantSettings.findMany({
        where: and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.namespace, namespace)),
      });
    });
  }

  async put(
    tenantId: string,
    namespace: string,
    key: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = putSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const existing = await tx.query.tenantSettings.findFirst({
          where: and(
            eq(tenantSettings.tenantId, tenantId),
            eq(tenantSettings.namespace, namespace),
            eq(tenantSettings.settingKey, key),
          ),
        });
        const now = new Date();
        let row;
        if (existing) {
          [row] = await tx
            .update(tenantSettings)
            .set({
              valueJson: data.value as object,
              isSensitive: data.isSensitive ?? existing.isSensitive,
              schemaVersion: data.schemaVersion ?? existing.schemaVersion,
              recordVersion: sql`${tenantSettings.recordVersion} + 1`,
              updatedAt: now,
              updatedByUserId: principal.userId,
            })
            .where(eq(tenantSettings.id, existing.id))
            .returning();
        } else {
          [row] = await tx
            .insert(tenantSettings)
            .values({
              id: createId(),
              tenantId,
              namespace,
              settingKey: key,
              valueJson: data.value as object,
              schemaVersion: data.schemaVersion ?? 1,
              isSensitive: data.isSensitive ?? false,
              createdAt: now,
              updatedAt: now,
              updatedByUserId: principal.userId,
            })
            .returning();
        }
        if (!row) {
          throw new ForgeError("INTERNAL_ERROR", "Failed to upsert tenant setting");
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "tenant_setting",
          aggregateId: row.id,
          eventType: DOMAIN_EVENT_TYPES.CONFIGURATION_CHANGED,
          payload: { tenantId, namespace, key },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "configuration.put",
          resourceType: "tenant_setting",
          resourceId: row.id,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: row.isSensitive ? { namespace, key, isSensitive: true } : row,
        });
        return row;
      },
      principal.userId,
    );
  }

  listCatalog() {
    return {
      namespaces: CONFIG_NAMESPACES.map((namespace) => ({
        namespace,
        label: CONFIG_NAMESPACE_LABELS[namespace],
        tenantAdminEditable: TENANT_ADMIN_NAMESPACES.includes(namespace),
      })),
    };
  }

  async listStudioObjects(tenantId: string, namespace: string, principal: ForgePrincipal) {
    const ns = this.requireNamespace(namespace);
    assertNamespaceReadAccess(principal, ns);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const objects = await tx.query.configObjects.findMany({
        where: and(eq(configObjects.tenantId, tenantId), eq(configObjects.namespace, ns)),
        orderBy: (t, { asc }) => [asc(t.objectKey)],
      });
      return { namespace: ns, label: CONFIG_NAMESPACE_LABELS[ns], items: objects };
    });
  }

  async ensureDefaults(tenantId: string, principal: ForgePrincipal) {
    if (!canUpdateConfig(principal)) {
      denyAuthorization("Missing configuration permission");
    }
    const created: string[] = [];
    for (const namespace of CONFIG_NAMESPACES) {
      const isCreator =
        principal.isPlatformAdmin || principal.permissions.has("platform.configuration.update");
      if (!isCreator && !TENANT_ADMIN_NAMESPACES.includes(namespace)) continue;
      const existing = await this.listStudioObjects(tenantId, namespace, principal);
      if (existing.items.length > 0) continue;
      await this.createDraft(
        tenantId,
        namespace,
        {
          objectKey: "default",
          displayName: CONFIG_NAMESPACE_LABELS[namespace],
          payload: DEFAULT_PAYLOADS[namespace],
          changeSummary: "Seeded default draft",
        },
        principal,
      );
      created.push(namespace);
    }
    return { created };
  }

  async createDraft(
    tenantId: string,
    namespace: string,
    body: unknown,
    principal: ForgePrincipal,
    options?: { allowPublishPrincipal?: boolean },
  ) {
    const ns = this.requireNamespace(namespace);
    if (options?.allowPublishPrincipal) {
      assertNamespacePublishAccess(principal, ns);
    } else {
      assertNamespaceWriteAccess(principal, ns);
    }
    const input = createDraftSchema.parse(body);
    let payload: ReturnType<typeof validateConfigPayload>;
    try {
      payload = validateConfigPayload(ns, input.payload);
    } catch (error) {
      emitConfigMetric(CONFIG_METRICS.ValidationFailures);
      throw error;
    }
    const contentHash = hashConfigPayload(payload);
    const now = new Date();

    try {
      return await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          let object = await tx.query.configObjects.findFirst({
            where: and(
              eq(configObjects.tenantId, tenantId),
              eq(configObjects.namespace, ns),
              eq(configObjects.objectKey, input.objectKey),
            ),
          });
          if (!object) {
            const objectId = createId();
            [object] = await tx
              .insert(configObjects)
              .values({
                id: objectId,
                tenantId,
                namespace: ns,
                objectKey: input.objectKey,
                displayName: input.displayName ?? CONFIG_NAMESPACE_LABELS[ns],
                createdAt: now,
                updatedAt: now,
              })
              .returning();
          }
          if (!object) {
            throw new ForgeError("INTERNAL_ERROR", "Failed to create config object");
          }

          const latest = await tx.query.configVersions.findFirst({
            where: eq(configVersions.objectId, object.id),
            orderBy: [desc(configVersions.version)],
          });
          const nextVersion = (latest?.version ?? 0) + 1;
          const versionId = createId();
          const [version] = await tx
            .insert(configVersions)
            .values({
              id: versionId,
              tenantId,
              objectId: object.id,
              version: nextVersion,
              state: "DRAFT",
              payloadJson: payload as object,
              contentHash,
              changeSummary: input.changeSummary ?? null,
              createdByUserId: principal.userId,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          if (!version) {
            throw new ForgeError("INTERNAL_ERROR", "Failed to create draft version");
          }

          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "configuration.draft.create",
            resourceType: "config_version",
            resourceId: version.id,
            result: "SUCCESS",
            riskLevel: "MEDIUM",
            correlationId: principal.correlationId,
            requestId: principal.requestId,
            after: { namespace: ns, objectKey: object.objectKey, version: version.version },
          });

          return { object, version };
        },
        principal.userId,
      );
    } catch (error) {
      rethrowConfigDbError(error);
    }
  }

  async listVersions(
    tenantId: string,
    namespace: string,
    objectKey: string,
    principal: ForgePrincipal,
  ) {
    const ns = this.requireNamespace(namespace);
    assertNamespaceReadAccess(principal, ns);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const object = await this.requireObject(tx, tenantId, ns, objectKey);
      const versions = await tx.query.configVersions.findMany({
        where: eq(configVersions.objectId, object.id),
        orderBy: [desc(configVersions.version)],
      });
      return { object, versions };
    });
  }

  async getVersion(
    tenantId: string,
    namespace: string,
    objectKey: string,
    versionId: string,
    principal: ForgePrincipal,
  ) {
    const ns = this.requireNamespace(namespace);
    assertNamespaceReadAccess(principal, ns);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const object = await this.requireObject(tx, tenantId, ns, objectKey);
      const version = await tx.query.configVersions.findFirst({
        where: and(
          eq(configVersions.id, versionId),
          eq(configVersions.objectId, object.id),
          eq(configVersions.tenantId, tenantId),
        ),
      });
      if (!version) {
        throw new ForgeError("NOT_FOUND", "Config version not found");
      }
      return { object, version };
    });
  }

  async patchDraft(
    tenantId: string,
    namespace: string,
    objectKey: string,
    versionId: string,
    body: unknown,
    principal: ForgePrincipal,
  ) {
    const ns = this.requireNamespace(namespace);
    assertNamespaceWriteAccess(principal, ns);
    const input = patchDraftSchema.parse(body);
    const payload = validateConfigPayload(ns, input.payload);
    const contentHash = hashConfigPayload(payload);
    const now = new Date();

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const object = await this.requireObject(tx, tenantId, ns, objectKey);
        const version = await tx.query.configVersions.findFirst({
          where: and(eq(configVersions.id, versionId), eq(configVersions.objectId, object.id)),
        });
        if (!version) {
          throw new ForgeError("NOT_FOUND", "Config version not found");
        }
        if (version.state !== "DRAFT") {
          throw new ForgeError("CONFLICT", "Only DRAFT versions can be patched");
        }
        if (input.displayName) {
          await tx
            .update(configObjects)
            .set({ displayName: input.displayName, updatedAt: now })
            .where(eq(configObjects.id, object.id));
        }
        const [updated] = await tx
          .update(configVersions)
          .set({
            payloadJson: payload as object,
            contentHash,
            changeSummary: input.changeSummary ?? version.changeSummary,
            updatedAt: now,
            recordVersion: sql`${configVersions.recordVersion} + 1`,
          })
          .where(eq(configVersions.id, version.id))
          .returning();
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "configuration.draft.patch",
          resourceType: "config_version",
          resourceId: version.id,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { contentHash },
        });
        return { object, version: updated };
      },
      principal.userId,
    );
  }

  async publish(
    tenantId: string,
    namespace: string,
    objectKey: string,
    versionId: string,
    principal: ForgePrincipal,
  ) {
    if (!canPublishConfig(principal)) {
      denyAuthorization("Missing configuration publish permission");
    }
    const ns = this.requireNamespace(namespace);
    assertNamespacePublishAccess(principal, ns);
    const now = new Date();

    try {
      return await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const object = await this.requireObject(tx, tenantId, ns, objectKey);
          const version = await this.requireVersion(tx, tenantId, object.id, versionId);
          if (version.state !== "DRAFT" && version.state !== "SCHEDULED") {
            throw new ForgeError("CONFLICT", "Only DRAFT or SCHEDULED versions can be published");
          }
          assertTransition(version.state as ConfigVersionState, "PUBLISHED");

          const currentPublished = await tx.query.configVersions.findFirst({
            where: and(
              eq(configVersions.objectId, object.id),
              eq(configVersions.state, "PUBLISHED"),
            ),
          });
          if (currentPublished) {
            await tx
              .update(configVersions)
              .set({
                state: "SUPERSEDED",
                effectiveTo: now,
                updatedAt: now,
              })
              .where(eq(configVersions.id, currentPublished.id));
          }

          const [published] = await tx
            .update(configVersions)
            .set({
              state: "PUBLISHED",
              publishedAt: now,
              effectiveFrom: version.effectiveFrom ?? now,
              publishedByUserId: principal.userId,
              supersedesVersionId: currentPublished?.id ?? null,
              updatedAt: now,
            })
            .where(eq(configVersions.id, version.id))
            .returning();

          await tx
            .update(configObjects)
            .set({
              currentPublishedVersionId: version.id,
              updatedAt: now,
              recordVersion: sql`${configObjects.recordVersion} + 1`,
            })
            .where(eq(configObjects.id, object.id));

          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "config_object",
            aggregateId: object.id,
            eventType: DOMAIN_EVENT_TYPES.CONFIGURATION_VERSION_PUBLISHED,
            payload: { tenantId, namespace: ns, objectKey, versionId: version.id },
            correlationId: principal.correlationId,
            actorUserId: principal.userId,
          });
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "configuration.publish",
            resourceType: "config_version",
            resourceId: version.id,
            result: "SUCCESS",
            riskLevel: "HIGH",
            correlationId: principal.correlationId,
            requestId: principal.requestId,
            after: { state: "PUBLISHED", supersedes: currentPublished?.id ?? null },
          });
          return { object, version: published };
        },
        principal.userId,
      );
    } catch (error) {
      if (!(error instanceof ForgeError && error.code === "FORBIDDEN")) {
        emitConfigMetric(CONFIG_METRICS.PublishFailures);
      }
      if (isRlsDenialError(error)) {
        emitConfigMetric(CONFIG_METRICS.RlsDenials);
      }
      throw error;
    }
  }

  async schedule(
    tenantId: string,
    namespace: string,
    objectKey: string,
    versionId: string,
    body: unknown,
    principal: ForgePrincipal,
  ) {
    if (!canPublishConfig(principal)) {
      denyAuthorization("Missing configuration publish permission");
    }
    const ns = this.requireNamespace(namespace);
    assertNamespacePublishAccess(principal, ns);
    let input: z.infer<typeof scheduleSchema>;
    try {
      input = scheduleSchema.parse(body);
    } catch (error) {
      emitConfigMetric(CONFIG_METRICS.ValidationFailures);
      throw error;
    }
    const effectiveFrom = new Date(input.effectiveFrom);
    if (effectiveFrom.getTime() <= Date.now()) {
      emitConfigMetric(CONFIG_METRICS.ValidationFailures);
      throw new ForgeError("VALIDATION_FAILED", "effectiveFrom must be in the future");
    }
    const now = new Date();

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const object = await this.requireObject(tx, tenantId, ns, objectKey);
        const version = await this.requireVersion(tx, tenantId, object.id, versionId);
        if (version.state !== "DRAFT") {
          throw new ForgeError("CONFLICT", "Only DRAFT versions can be scheduled");
        }
        assertTransition("DRAFT", "SCHEDULED");
        const [scheduled] = await tx
          .update(configVersions)
          .set({
            state: "SCHEDULED",
            scheduledFor: effectiveFrom,
            effectiveFrom,
            changeSummary: input.changeSummary ?? version.changeSummary,
            updatedAt: now,
          })
          .where(eq(configVersions.id, version.id))
          .returning();
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "config_object",
          aggregateId: object.id,
          eventType: DOMAIN_EVENT_TYPES.CONFIGURATION_VERSION_SCHEDULED,
          payload: { tenantId, namespace: ns, objectKey, versionId, effectiveFrom },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "configuration.schedule",
          resourceType: "config_version",
          resourceId: version.id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { state: "SCHEDULED", effectiveFrom },
        });
        return { object, version: scheduled };
      },
      principal.userId,
    );
  }

  async archive(
    tenantId: string,
    namespace: string,
    objectKey: string,
    versionId: string,
    principal: ForgePrincipal,
  ) {
    if (!canPublishConfig(principal)) {
      denyAuthorization("Missing configuration publish permission");
    }
    const ns = this.requireNamespace(namespace);
    assertNamespacePublishAccess(principal, ns);
    const now = new Date();

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const object = await this.requireObject(tx, tenantId, ns, objectKey);
        const version = await this.requireVersion(tx, tenantId, object.id, versionId);
        assertTransition(version.state as ConfigVersionState, "ARCHIVED");
        const [archived] = await tx
          .update(configVersions)
          .set({
            state: "ARCHIVED",
            effectiveTo: now,
            updatedAt: now,
          })
          .where(eq(configVersions.id, version.id))
          .returning();
        if (object.currentPublishedVersionId === version.id) {
          await tx
            .update(configObjects)
            .set({ currentPublishedVersionId: null, updatedAt: now })
            .where(eq(configObjects.id, object.id));
        }
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "config_object",
          aggregateId: object.id,
          eventType: DOMAIN_EVENT_TYPES.CONFIGURATION_VERSION_ARCHIVED,
          payload: { tenantId, namespace: ns, objectKey, versionId },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "configuration.archive",
          resourceType: "config_version",
          resourceId: version.id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { state: "ARCHIVED" },
        });
        return { object, version: archived };
      },
      principal.userId,
    );
  }

  async rollback(
    tenantId: string,
    namespace: string,
    objectKey: string,
    versionId: string,
    principal: ForgePrincipal,
  ) {
    if (!canPublishConfig(principal)) {
      denyAuthorization("Missing configuration publish permission");
    }
    const ns = this.requireNamespace(namespace);
    assertNamespacePublishAccess(principal, ns);

    try {
      const { version: source } = await this.getVersion(
        tenantId,
        namespace,
        objectKey,
        versionId,
        principal,
      );
      if (
        source.state !== "SUPERSEDED" &&
        source.state !== "ARCHIVED" &&
        source.state !== "PUBLISHED"
      ) {
        emitConfigMetric(CONFIG_METRICS.ValidationFailures);
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Rollback source must be PUBLISHED, SUPERSEDED, or ARCHIVED",
        );
      }

      const draft = await this.createDraft(
        tenantId,
        namespace,
        {
          objectKey,
          payload: source.payloadJson,
          changeSummary: `Rollback clone of version ${source.version}`,
        },
        principal,
        { allowPublishPrincipal: true },
      );
      const published = await this.publish(
        tenantId,
        namespace,
        objectKey,
        draft.version.id,
        principal,
      );

      await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "config_object",
            aggregateId: published.object.id,
            eventType: DOMAIN_EVENT_TYPES.CONFIGURATION_VERSION_ROLLED_BACK,
            payload: {
              tenantId,
              namespace: ns,
              objectKey,
              fromVersionId: versionId,
              toVersionId: published.version!.id,
            },
            correlationId: principal.correlationId,
            actorUserId: principal.userId,
          });
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "configuration.rollback",
            resourceType: "config_version",
            resourceId: published.version!.id,
            result: "SUCCESS",
            riskLevel: "HIGH",
            correlationId: principal.correlationId,
            requestId: principal.requestId,
            after: { fromVersionId: versionId, toVersionId: published.version!.id },
          });
        },
        principal.userId,
      );

      return published;
    } catch (error) {
      if (!(error instanceof ForgeError && error.code === "FORBIDDEN")) {
        emitConfigMetric(CONFIG_METRICS.RollbackFailures);
      }
      if (isRlsDenialError(error)) {
        emitConfigMetric(CONFIG_METRICS.RlsDenials);
      }
      throw error;
    }
  }

  async compare(
    tenantId: string,
    namespace: string,
    objectKey: string,
    fromVersionId: string,
    toVersionId: string,
    principal: ForgePrincipal,
  ) {
    const from = await this.getVersion(tenantId, namespace, objectKey, fromVersionId, principal);
    const to = await this.getVersion(tenantId, namespace, objectKey, toVersionId, principal);
    return {
      from: from.version,
      to: to.version,
      diffs: comparePayloads(from.version.payloadJson, to.version.payloadJson),
    };
  }

  async effective(
    tenantId: string,
    namespace: string,
    objectKey: string,
    atIso: string | undefined,
    principal: ForgePrincipal,
  ) {
    const ns = this.requireNamespace(namespace);
    // Published effective config is readable by any authenticated principal for the tenant.
    if (!principal.userId) {
      throw new ForgeError("UNAUTHORIZED", "Authentication required");
    }
    return this.effectivePublished(tenantId, ns, objectKey, atIso);
  }

  /**
   * Load published effective config for a known tenant without a principal
   * (public host → tenant resolution, system jobs).
   */
  async effectivePublished(
    tenantId: string,
    namespace: ConfigNamespace,
    objectKey: string,
    atIso?: string,
  ) {
    const at = atIso ? new Date(atIso) : new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const object = await tx.query.configObjects.findFirst({
        where: and(
          eq(configObjects.tenantId, tenantId),
          eq(configObjects.namespace, namespace),
          eq(configObjects.objectKey, objectKey),
        ),
      });
      if (!object) {
        return {
          namespace,
          objectKey,
          payload: DEFAULT_PAYLOADS[namespace],
          version: null,
          source: "default" as const,
        };
      }
      const versions = await tx.query.configVersions.findMany({
        where: eq(configVersions.objectId, object.id),
      });
      const effective = resolveEffectiveVersion(versions, at);
      if (!effective) {
        return {
          namespace,
          objectKey,
          object,
          payload: DEFAULT_PAYLOADS[namespace],
          version: null,
          source: "default" as const,
        };
      }
      // Promote due scheduled versions at read time.
      if (effective.state === "SCHEDULED") {
        await tx
          .update(configVersions)
          .set({ state: "PUBLISHED", publishedAt: at, updatedAt: at })
          .where(eq(configVersions.id, effective.id));
        const prior = versions.find((v) => v.state === "PUBLISHED" && v.id !== effective.id);
        if (prior) {
          await tx
            .update(configVersions)
            .set({ state: "SUPERSEDED", effectiveTo: at, updatedAt: at })
            .where(eq(configVersions.id, prior.id));
        }
        await tx
          .update(configObjects)
          .set({ currentPublishedVersionId: effective.id, updatedAt: at })
          .where(eq(configObjects.id, object.id));
      }
      return {
        namespace,
        objectKey,
        object,
        payload: effective.payloadJson,
        version: effective,
        source: "published" as const,
      };
    });
  }

  async exportBundle(tenantId: string, principal: ForgePrincipal) {
    if (!canUpdateConfig(principal)) {
      denyAuthorization("Missing configuration permission");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const objects = await tx.query.configObjects.findMany({
        where: eq(configObjects.tenantId, tenantId),
      });
      const versions = await tx.query.configVersions.findMany({
        where: eq(configVersions.tenantId, tenantId),
      });
      return {
        format: "forge.config.bundle.v1",
        exportedAt: new Date().toISOString(),
        tenantId,
        objects,
        versions,
      };
    });
  }

  async importBundle(
    tenantId: string,
    body: unknown,
    principal: ForgePrincipal,
    options?: { dryRun?: boolean },
  ) {
    if (!canUpdateConfig(principal)) {
      denyAuthorization("Missing configuration permission");
    }

    let bundle: z.infer<typeof importBundleSchema>;
    try {
      bundle = importBundleSchema.parse(body);
    } catch (error) {
      emitConfigMetric(CONFIG_METRICS.ValidationFailures);
      throw error;
    }

    const dryRun = Boolean(options?.dryRun || bundle.dryRun);
    const conflicts: Array<{
      namespace: string;
      objectKey: string;
      reason: string;
      existingObjectId?: string;
      currentPublishedVersionId?: string | null;
    }> = [];
    const validationErrors: Array<{
      namespace: string;
      objectKey: string;
      message: string;
    }> = [];
    const wouldImport: Array<{
      namespace: string;
      objectKey: string;
      displayName?: string;
      action: "create_draft";
    }> = [];
    const imported: string[] = [];

    for (const object of bundle.objects) {
      if (!isConfigNamespace(object.namespace)) {
        emitConfigMetric(CONFIG_METRICS.ValidationFailures);
        validationErrors.push({
          namespace: object.namespace,
          objectKey: object.objectKey,
          message: `Unknown configuration namespace: ${object.namespace}`,
        });
        continue;
      }

      try {
        assertNamespaceWriteAccess(principal, object.namespace);
      } catch (error) {
        validationErrors.push({
          namespace: object.namespace,
          objectKey: object.objectKey,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const matching = bundle.versions.find(
        (v) =>
          (v.objectKey ?? object.objectKey) === object.objectKey &&
          (!v.namespace || v.namespace === object.namespace),
      );
      const payload = matching?.payloadJson ?? DEFAULT_PAYLOADS[object.namespace];

      try {
        validateConfigPayload(object.namespace, payload);
      } catch (error) {
        emitConfigMetric(CONFIG_METRICS.ValidationFailures);
        validationErrors.push({
          namespace: object.namespace,
          objectKey: object.objectKey,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const existing = await withTenantTransaction(this.db, tenantId, async (tx) =>
        tx.query.configObjects.findFirst({
          where: and(
            eq(configObjects.tenantId, tenantId),
            eq(configObjects.namespace, object.namespace),
            eq(configObjects.objectKey, object.objectKey),
          ),
        }),
      );
      if (existing) {
        conflicts.push({
          namespace: object.namespace,
          objectKey: object.objectKey,
          reason: "OBJECT_EXISTS",
          existingObjectId: existing.id,
          currentPublishedVersionId: existing.currentPublishedVersionId,
        });
      }

      wouldImport.push({
        namespace: object.namespace,
        objectKey: object.objectKey,
        ...(object.displayName ? { displayName: object.displayName } : {}),
        action: "create_draft",
      });

      if (dryRun) {
        continue;
      }

      const draft = await this.createDraft(
        tenantId,
        object.namespace,
        {
          objectKey: object.objectKey,
          displayName: object.displayName,
          payload,
          changeSummary: matching?.changeSummary ?? "Imported draft",
        },
        principal,
      );
      imported.push(`${object.namespace}/${object.objectKey}@${draft.version.version}`);
    }

    const summary = {
      objectsEvaluated: bundle.objects.length,
      wouldImport: wouldImport.length,
      conflicts: conflicts.length,
      validationErrors: validationErrors.length,
      imported: imported.length,
      persisted: !dryRun,
    };

    if (dryRun) {
      return {
        dryRun: true as const,
        summary,
        conflicts,
        validationErrors,
        wouldImport,
        imported: [] as string[],
      };
    }

    return {
      dryRun: false as const,
      summary,
      conflicts,
      validationErrors,
      wouldImport,
      imported,
    };
  }

  private requireNamespace(namespace: string): ConfigNamespace {
    if (!isConfigNamespace(namespace)) {
      throw new ForgeError("VALIDATION_FAILED", `Unknown configuration namespace: ${namespace}`);
    }
    return namespace;
  }

  private async requireObject(
    tx: DatabaseTransaction,
    tenantId: string,
    namespace: ConfigNamespace,
    objectKey: string,
  ) {
    const object = await tx.query.configObjects.findFirst({
      where: and(
        eq(configObjects.tenantId, tenantId),
        eq(configObjects.namespace, namespace),
        eq(configObjects.objectKey, objectKey),
      ),
    });
    if (!object) {
      throw new ForgeError("NOT_FOUND", "Config object not found");
    }
    return object;
  }

  private async requireVersion(
    tx: DatabaseTransaction,
    tenantId: string,
    objectId: string,
    versionId: string,
  ) {
    const version = await tx.query.configVersions.findFirst({
      where: and(
        eq(configVersions.id, versionId),
        eq(configVersions.objectId, objectId),
        eq(configVersions.tenantId, tenantId),
      ),
    });
    if (!version) {
      throw new ForgeError("NOT_FOUND", "Config version not found");
    }
    return version;
  }
}
