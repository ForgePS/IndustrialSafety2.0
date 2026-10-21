import { Inject, Injectable } from "@nestjs/common";
import {
  findCatalogModule,
  type CatalogImplementationStatus,
} from "@forge/contracts";
import {
  createId,
  platformModules,
  platformProducts,
  tenantModuleEntitlements,
  tenantProducts,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

type ExpectedVersion = number | "*";

const putProductSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
  configuration: z.record(z.unknown()).optional(),
});

const putModuleSchema = z.object({
  status: z.enum(["ACTIVE", "PENDING", "SUSPENDED", "GRACE"]).default("ACTIVE"),
  sourceType: z.string().max(64).default("MANUAL"),
  quantityLimit: z.number().int().positive().optional().nullable(),
  configuration: z.record(z.unknown()).optional(),
  /** Required when the module code exists on more than one product. */
  productCode: z.string().min(1).max(64).optional(),
});

const batchModulesSchema = z.object({
  modules: z
    .array(
      z.object({
        code: z.string().min(1).max(64),
        status: z.enum(["ACTIVE", "PENDING", "SUSPENDED", "GRACE"]),
      }),
    )
    .min(1)
    .max(200),
});

@Injectable()
export class EntitlementsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const products = await tx
        .select({
          id: tenantProducts.id,
          status: tenantProducts.status,
          productCode: platformProducts.code,
          productName: platformProducts.name,
          enabledAt: tenantProducts.enabledAt,
          configurationJson: tenantProducts.configurationJson,
          recordVersion: tenantProducts.recordVersion,
        })
        .from(tenantProducts)
        .innerJoin(platformProducts, eq(platformProducts.id, tenantProducts.productId))
        .where(eq(tenantProducts.tenantId, tenantId));

      const modules = await tx
        .select({
          id: tenantModuleEntitlements.id,
          status: tenantModuleEntitlements.status,
          moduleCode: platformModules.code,
          moduleName: platformModules.name,
          productCode: platformProducts.code,
          productName: platformProducts.name,
          isCore: platformModules.isCore,
          startsAt: tenantModuleEntitlements.startsAt,
          endsAt: tenantModuleEntitlements.endsAt,
          configurationJson: tenantModuleEntitlements.configurationJson,
          recordVersion: tenantModuleEntitlements.recordVersion,
        })
        .from(tenantModuleEntitlements)
        .innerJoin(platformModules, eq(platformModules.id, tenantModuleEntitlements.moduleId))
        .innerJoin(platformProducts, eq(platformProducts.id, platformModules.productId))
        .where(eq(tenantModuleEntitlements.tenantId, tenantId));

      return {
        products,
        modules: modules.map((row) => {
          const catalog = findCatalogModule(row.productCode, row.moduleCode);
          return {
            ...row,
            category: catalog?.category ?? "General",
            classification: catalog?.classification ?? (row.isCore ? "PLATFORM_CORE" : "CUSTOMER_MODULE"),
            implementationStatus: catalog?.implementationStatus ?? "READY",
            customerAssignable:
              catalog?.customerAssignable ?? (!row.isCore && row.productCode !== "FORGE_CREATOR"),
          };
        }),
      };
    });
  }

  async putProduct(
    tenantId: string,
    productCode: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = putProductSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const product = await tx.query.platformProducts.findFirst({
        where: eq(platformProducts.code, productCode),
      });
      if (!product) {
        throw new ForgeError("NOT_FOUND", "Product not found");
      }
      const existing = await tx.query.tenantProducts.findFirst({
        where: and(
          eq(tenantProducts.tenantId, tenantId),
          eq(tenantProducts.productId, product.id),
        ),
      });
      const now = new Date();
      let row;
      if (existing) {
        [row] = await tx
          .update(tenantProducts)
          .set({
            status: data.status,
            configurationJson: data.configuration ?? existing.configurationJson,
            disabledAt: data.status === "DISABLED" ? now : null,
            recordVersion: sql`${tenantProducts.recordVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(tenantProducts.id, existing.id))
          .returning();
      } else {
        [row] = await tx
          .insert(tenantProducts)
          .values({
            id: createId(),
            tenantId,
            productId: product.id,
            status: data.status,
            enabledAt: now,
            configurationJson: data.configuration ?? {},
            createdAt: now,
            updatedAt: now,
          })
          .returning();
      }
      if (!row) {
        throw new Error("Failed to upsert tenant product");
      }

      if (data.status === "ACTIVE") {
        await this.ensureCoreModule(tx, tenantId, product.id, productCode, principal, now);
      }

      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "tenant_product",
        aggregateId: row.id,
        eventType: DOMAIN_EVENT_TYPES.ENTITLEMENT_CHANGED,
        payload: { tenantId, productCode, status: data.status },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "entitlement.product.put",
        resourceType: "tenant_product",
        resourceId: row.id,
        result: "SUCCESS",
        riskLevel: "HIGH",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: row,
      });
      return row;
    }, principal.userId);
  }

  async putModule(
    tenantId: string,
    moduleCode: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = putModuleSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const mod = await this.resolveModule(tx, moduleCode, data.productCode);
      const product = await tx.query.platformProducts.findFirst({
        where: eq(platformProducts.id, mod.productId),
      });
      if (!product) {
        throw new ForgeError("NOT_FOUND", "Product not found for module");
      }

      await this.assertProductActiveForModule(tx, tenantId, product, data.status);
      this.assertModuleAssignable(product.code, mod, data.status);

      const existing = await tx.query.tenantModuleEntitlements.findFirst({
        where: and(
          eq(tenantModuleEntitlements.tenantId, tenantId),
          eq(tenantModuleEntitlements.moduleId, mod.id),
        ),
      });
      const now = new Date();
      let row;
      if (existing) {
        [row] = await tx
          .update(tenantModuleEntitlements)
          .set({
            status: data.status,
            sourceType: data.sourceType,
            quantityLimit: data.quantityLimit ?? existing.quantityLimit,
            configurationJson: data.configuration ?? existing.configurationJson,
            recordVersion: sql`${tenantModuleEntitlements.recordVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(tenantModuleEntitlements.id, existing.id))
          .returning();
      } else {
        [row] = await tx
          .insert(tenantModuleEntitlements)
          .values({
            id: createId(),
            tenantId,
            moduleId: mod.id,
            status: data.status,
            sourceType: data.sourceType,
            quantityLimit: data.quantityLimit,
            startsAt: now,
            configurationJson: data.configuration ?? {},
            createdAt: now,
            updatedAt: now,
          })
          .returning();
      }
      if (!row) {
        throw new Error("Failed to upsert module entitlement");
      }
      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "tenant_module_entitlement",
        aggregateId: row.id,
        eventType: DOMAIN_EVENT_TYPES.ENTITLEMENT_CHANGED,
        payload: {
          tenantId,
          productCode: product.code,
          moduleCode,
          status: data.status,
        },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "entitlement.module.put",
        resourceType: "tenant_module_entitlement",
        resourceId: row.id,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        before: existing ? { status: existing.status } : undefined,
        after: {
          productCode: product.code,
          moduleCode,
          status: data.status,
          sourceType: data.sourceType,
        },
      });
      return row;
    }, principal.userId);
  }

  /**
   * Atomic batch update of customer-assignable modules for one product.
   * Does not disable PLATFORM_CORE rows.
   */
  async putProductModules(
    tenantId: string,
    productCode: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = batchModulesSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const product = await tx.query.platformProducts.findFirst({
        where: eq(platformProducts.code, productCode),
      });
      if (!product) {
        throw new ForgeError("NOT_FOUND", "Product not found");
      }
      const tenantProduct = await tx.query.tenantProducts.findFirst({
        where: and(
          eq(tenantProducts.tenantId, tenantId),
          eq(tenantProducts.productId, product.id),
        ),
      });
      if (!tenantProduct || tenantProduct.status !== "ACTIVE") {
        throw new ForgeError(
          "CONFLICT",
          `Could not update modules. ${product.name} must be enabled for this customer first.`,
        );
      }

      const catalogMods = await tx.query.platformModules.findMany({
        where: eq(platformModules.productId, product.id),
      });
      const byCode = new Map(catalogMods.map((m) => [m.code, m]));
      const now = new Date();
      const results: Array<{ moduleCode: string; status: string }> = [];

      for (const item of data.modules) {
        const mod = byCode.get(item.code);
        if (!mod) {
          throw new ForgeError("NOT_FOUND", `Module ${item.code} not found on ${productCode}`);
        }
        if (mod.isCore) {
          continue;
        }
        this.assertModuleAssignable(productCode, mod, item.status);

        const existing = await tx.query.tenantModuleEntitlements.findFirst({
          where: and(
            eq(tenantModuleEntitlements.tenantId, tenantId),
            eq(tenantModuleEntitlements.moduleId, mod.id),
          ),
        });
        if (existing) {
          await tx
            .update(tenantModuleEntitlements)
            .set({
              status: item.status,
              recordVersion: sql`${tenantModuleEntitlements.recordVersion} + 1`,
              updatedAt: now,
            })
            .where(eq(tenantModuleEntitlements.id, existing.id));
        } else {
          await tx.insert(tenantModuleEntitlements).values({
            id: createId(),
            tenantId,
            moduleId: mod.id,
            status: item.status,
            sourceType: "MANUAL",
            startsAt: now,
            configurationJson: {},
            createdAt: now,
            updatedAt: now,
          });
        }
        results.push({ moduleCode: item.code, status: item.status });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "entitlement.module.put",
          resourceType: "tenant_module_entitlement",
          resourceId: existing?.id ?? mod.id,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          before: existing ? { status: existing.status } : undefined,
          after: { productCode, moduleCode: item.code, status: item.status },
        });
      }

      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "tenant_module_entitlement",
        aggregateId: tenantId,
        eventType: DOMAIN_EVENT_TYPES.ENTITLEMENT_CHANGED,
        payload: { tenantId, productCode, batch: true, count: results.length },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });

      return { productCode, modules: results };
    }, principal.userId);
  }

  async setModuleStatus(
    tenantId: string,
    moduleCode: string,
    status: "SUSPENDED" | "ACTIVE",
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
    productCode?: string,
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const mod = await this.resolveModule(tx, moduleCode, productCode);
      const product = await tx.query.platformProducts.findFirst({
        where: eq(platformProducts.id, mod.productId),
      });
      if (!product) {
        throw new ForgeError("NOT_FOUND", "Product not found for module");
      }
      if (status === "ACTIVE") {
        await this.assertProductActiveForModule(tx, tenantId, product, status);
        this.assertModuleAssignable(product.code, mod, status);
      }
      const before = await tx.query.tenantModuleEntitlements.findFirst({
        where: and(
          eq(tenantModuleEntitlements.tenantId, tenantId),
          eq(tenantModuleEntitlements.moduleId, mod.id),
        ),
      });
      if (!before) {
        throw new ForgeError("NOT_FOUND", "Module entitlement not found");
      }
      const version = before.recordVersion;
      if (expectedVersion !== "*" && version !== expectedVersion) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "entitlement",
          resourceId: before.id,
          expectedVersion,
          actualVersion: version,
        });
      }
      const [updated] = await tx
        .update(tenantModuleEntitlements)
        .set({ status, recordVersion: version + 1, updatedAt: new Date() })
        .where(
          and(
            eq(tenantModuleEntitlements.id, before.id),
            eq(tenantModuleEntitlements.recordVersion, version),
          ),
        )
        .returning();
      if (!updated) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "entitlement",
          resourceId: before.id,
          expectedVersion,
          actualVersion: null,
        });
      }
      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "tenant_module_entitlement",
        aggregateId: updated.id,
        eventType: DOMAIN_EVENT_TYPES.ENTITLEMENT_CHANGED,
        payload: { tenantId, productCode: product.code, moduleCode, status },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "entitlement.module.put",
        resourceType: "tenant_module_entitlement",
        resourceId: updated.id,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        before: { status: before.status },
        after: { productCode: product.code, moduleCode, status },
      });
      return updated;
    }, principal.userId);
  }

  private async resolveModule(
    tx: DatabaseTransaction,
    moduleCode: string,
    productCode?: string,
  ): Promise<typeof platformModules.$inferSelect> {
    if (productCode) {
      const product = await tx.query.platformProducts.findFirst({
        where: eq(platformProducts.code, productCode),
      });
      if (!product) {
        throw new ForgeError("NOT_FOUND", "Product not found");
      }
      const existing = await tx.query.platformModules.findFirst({
        where: and(
          eq(platformModules.productId, product.id),
          eq(platformModules.code, moduleCode),
        ),
      });
      if (existing) return existing;

      const ensured = await this.ensureCatalogPlatformModule(tx, product.id, productCode, moduleCode);
      if (ensured) return ensured;

      throw new ForgeError(
        "NOT_FOUND",
        `Module ${moduleCode} was not found for product ${productCode}`,
      );
    }

    const matches = await tx.query.platformModules.findMany({
      where: eq(platformModules.code, moduleCode),
    });
    if (matches.length === 0) {
      throw new ForgeError("NOT_FOUND", "Module not found");
    }
    if (matches.length > 1) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `Module code ${moduleCode} exists on multiple products. Include productCode.`,
      );
    }
    return matches[0]!;
  }

  /**
   * Backfill a missing platform_modules row from the contracts catalog.
   * Production DBs can lag the registry when new industrial modules are added.
   */
  private async ensureCatalogPlatformModule(
    tx: DatabaseTransaction,
    productId: string,
    productCode: string,
    moduleCode: string,
  ): Promise<typeof platformModules.$inferSelect | null> {
    const catalog = findCatalogModule(productCode, moduleCode);
    if (!catalog) return null;

    const now = new Date();
    const [inserted] = await tx
      .insert(platformModules)
      .values({
        id: createId(),
        productId,
        code: catalog.code,
        name: catalog.name,
        description: catalog.description ?? null,
        status: "ACTIVE",
        isCore: catalog.classification === "PLATFORM_CORE",
        category: catalog.category,
        classification: catalog.classification,
        implementationStatus: catalog.implementationStatus,
        customerAssignable: catalog.customerAssignable,
        displayOrder: catalog.displayOrder,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) return inserted;

    return (
      (await tx.query.platformModules.findFirst({
        where: and(eq(platformModules.productId, productId), eq(platformModules.code, moduleCode)),
      })) ?? null
    );
  }

  private async assertProductActiveForModule(
    tx: DatabaseTransaction,
    tenantId: string,
    product: { id: string; code: string; name: string },
    status: string,
  ) {
    if (status !== "ACTIVE") return;
    const tenantProduct = await tx.query.tenantProducts.findFirst({
      where: and(
        eq(tenantProducts.tenantId, tenantId),
        eq(tenantProducts.productId, product.id),
      ),
    });
    if (!tenantProduct || tenantProduct.status !== "ACTIVE") {
      throw new ForgeError(
        "CONFLICT",
        `Could not enable module. ${product.name} must be active for this customer first.`,
      );
    }
  }

  private assertModuleAssignable(
    productCode: string,
    mod: {
      code: string;
      name: string;
      isCore: boolean;
    },
    status: string,
  ) {
    if (status !== "ACTIVE") return;
    if (mod.isCore) {
      return;
    }
    const catalog = findCatalogModule(productCode, mod.code);
    const implementationStatus = (catalog?.implementationStatus ??
      "READY") as CatalogImplementationStatus;
    const customerAssignable =
      catalog?.customerAssignable ?? (!mod.isCore && productCode !== "FORGE_CREATOR");
    if (!customerAssignable) {
      throw new ForgeError(
        "CONFLICT",
        `${mod.name} is not a customer-assignable module.`,
      );
    }
    if (implementationStatus !== "READY") {
      throw new ForgeError(
        "CONFLICT",
        `Could not enable ${mod.name}. It is not ready in AWS yet.`,
      );
    }
  }

  private async ensureCoreModule(
    tx: DatabaseTransaction,
    tenantId: string,
    productId: string,
    productCode: string,
    principal: ForgePrincipal,
    now: Date,
  ) {
    const core = await tx.query.platformModules.findFirst({
      where: and(eq(platformModules.productId, productId), eq(platformModules.code, "CORE")),
    });
    if (!core) return;
    const existing = await tx.query.tenantModuleEntitlements.findFirst({
      where: and(
        eq(tenantModuleEntitlements.tenantId, tenantId),
        eq(tenantModuleEntitlements.moduleId, core.id),
      ),
    });
    if (existing) {
      if (existing.status !== "ACTIVE") {
        await tx
          .update(tenantModuleEntitlements)
          .set({
            status: "ACTIVE",
            recordVersion: sql`${tenantModuleEntitlements.recordVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(tenantModuleEntitlements.id, existing.id));
      }
      return;
    }
    const [row] = await tx
      .insert(tenantModuleEntitlements)
      .values({
        id: createId(),
        tenantId,
        moduleId: core.id,
        status: "ACTIVE",
        sourceType: "PRODUCT_CORE",
        startsAt: now,
        configurationJson: {},
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (row) {
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "entitlement.module.put",
        resourceType: "tenant_module_entitlement",
        resourceId: row.id,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: { productCode, moduleCode: "CORE", status: "ACTIVE", sourceType: "PRODUCT_CORE" },
      });
    }
  }
}
