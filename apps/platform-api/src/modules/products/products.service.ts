import { Inject, Injectable } from "@nestjs/common";
import {
  FORGE_PLATFORMS,
  catalogAvailabilityLabel,
  createPlanPriceInputSchema,
  createPlatformModuleInputSchema,
  createSubscriptionPlanInputSchema,
  findCatalogModule,
  findPlatformByProductCode,
  patchPlanPriceInputSchema,
  patchPlatformModuleInputSchema,
  patchPlatformProductInputSchema,
  patchSubscriptionPlanInputSchema,
} from "@forge/contracts";
import {
  createId,
  platformModules,
  platformProducts,
  prices,
  subscriptionItems,
  subscriptionPlans,
  subscriptions,
  tenantModuleEntitlements,
  tenantProducts,
  type Database,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";

@Injectable()
export class ProductsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listProducts(includeArchived = false) {
    const rows = await this.db.query.platformProducts.findMany({
      where: includeArchived ? undefined : eq(platformProducts.status, "ACTIVE"),
      orderBy: (t, { asc: orderAsc }) => [orderAsc(t.code)],
    });
    return rows.map((row) => {
      const platform = findPlatformByProductCode(row.code);
      return {
        ...row,
        platformKey: platform?.key ?? null,
        customerAssignable: platform?.customerAssignable ?? row.code !== "FORGE_CREATOR",
        displayOrder: platform?.displayOrder ?? 100,
      };
    });
  }

  async listPlatforms() {
    const products = await this.listProducts();
    const moduleCounts = await this.db
      .select({
        productId: platformModules.productId,
        modules: count(platformModules.id),
      })
      .from(platformModules)
      .where(eq(platformModules.status, "ACTIVE"))
      .groupBy(platformModules.productId);

    const customerCounts = await this.db
      .select({
        productId: tenantProducts.productId,
        customers: count(tenantProducts.id),
      })
      .from(tenantProducts)
      .where(eq(tenantProducts.status, "ACTIVE"))
      .groupBy(tenantProducts.productId);

    const modulesByProduct = new Map(moduleCounts.map((r) => [r.productId, Number(r.modules)]));
    const customersByProduct = new Map(
      customerCounts.map((r) => [r.productId, Number(r.customers)]),
    );

    return FORGE_PLATFORMS.map((platform) => {
      const product = products.find((p) => p.code === platform.productCode);
      return {
        ...platform,
        productId: product?.id ?? null,
        moduleCount: product ? (modulesByProduct.get(product.id) ?? 0) : 0,
        customerCount: product ? (customersByProduct.get(product.id) ?? 0) : 0,
      };
    });
  }

  async patchProduct(productCode: string, input: unknown) {
    const data = patchPlatformProductInputSchema.parse(input);
    const before = await this.db.query.platformProducts.findFirst({
      where: eq(platformProducts.code, productCode),
    });
    if (!before) {
      throw new ForgeError("NOT_FOUND", "Platform product not found");
    }
    const [updated] = await this.db
      .update(platformProducts)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(platformProducts.id, before.id))
      .returning();
    if (!updated) {
      throw new ForgeError("INTERNAL_ERROR", "Failed to update platform product");
    }
    const platform = findPlatformByProductCode(updated.code);
    return {
      ...updated,
      platformKey: platform?.key ?? null,
      customerAssignable: platform?.customerAssignable ?? updated.code !== "FORGE_CREATOR",
      displayOrder: platform?.displayOrder ?? 100,
    };
  }

  async listModules(productCode?: string, includeArchived = false) {
    const rows = await this.db
      .select({
        id: platformModules.id,
        code: platformModules.code,
        name: platformModules.name,
        description: platformModules.description,
        status: platformModules.status,
        isCore: platformModules.isCore,
        category: platformModules.category,
        classification: platformModules.classification,
        implementationStatus: platformModules.implementationStatus,
        customerAssignable: platformModules.customerAssignable,
        displayOrder: platformModules.displayOrder,
        productId: platformModules.productId,
        productCode: platformProducts.code,
        productName: platformProducts.name,
        createdAt: platformModules.createdAt,
        updatedAt: platformModules.updatedAt,
      })
      .from(platformModules)
      .innerJoin(platformProducts, eq(platformProducts.id, platformModules.productId))
      .where(
        productCode
          ? includeArchived
            ? eq(platformProducts.code, productCode)
            : and(eq(platformModules.status, "ACTIVE"), eq(platformProducts.code, productCode))
          : includeArchived
            ? undefined
            : eq(platformModules.status, "ACTIVE"),
      )
      .orderBy(asc(platformProducts.code), asc(platformModules.code));

    const assignmentCounts = await this.db
      .select({
        moduleId: tenantModuleEntitlements.moduleId,
        customers: count(tenantModuleEntitlements.id),
      })
      .from(tenantModuleEntitlements)
      .where(eq(tenantModuleEntitlements.status, "ACTIVE"))
      .groupBy(tenantModuleEntitlements.moduleId);
    const countByModule = new Map(
      assignmentCounts.map((r) => [r.moduleId, Number(r.customers)]),
    );

    return rows
      .map((row) => {
        const catalog = findCatalogModule(row.productCode, row.code);
        const platform = findPlatformByProductCode(row.productCode);
        const implementationStatus =
          row.implementationStatus || catalog?.implementationStatus || "READY";
        return {
          id: row.id,
          code: row.code,
          name: row.name || catalog?.name || row.code,
          description: row.description ?? catalog?.description ?? null,
          status: row.status,
          isCore: row.isCore,
          category: row.category || catalog?.category || (row.isCore ? "Platform" : "General"),
          classification:
            row.classification ||
            catalog?.classification ||
            (row.isCore ? "PLATFORM_CORE" : "CUSTOMER_MODULE"),
          implementationStatus,
          availabilityLabel: catalogAvailabilityLabel(implementationStatus),
          customerAssignable:
            row.customerAssignable ??
            catalog?.customerAssignable ??
            (!row.isCore && row.productCode !== "FORGE_CREATOR"),
          displayOrder: row.displayOrder ?? catalog?.displayOrder ?? 100,
          productId: row.productId,
          productCode: row.productCode,
          productName: row.productName,
          platformKey: platform?.key ?? null,
          customerAssignmentCount: countByModule.get(row.id) ?? 0,
          route: catalog?.route ?? null,
        };
      })
      .sort(
        (a, b) =>
          a.productCode.localeCompare(b.productCode) ||
          a.displayOrder - b.displayOrder ||
          a.name.localeCompare(b.name),
      );
  }

  private async findModuleRow(productCode: string, moduleCode: string) {
    const product = await this.db.query.platformProducts.findFirst({
      where: eq(platformProducts.code, productCode),
    });
    if (!product) {
      throw new ForgeError("NOT_FOUND", "Platform product not found");
    }
    const mod = await this.db.query.platformModules.findFirst({
      where: and(eq(platformModules.productId, product.id), eq(platformModules.code, moduleCode)),
    });
    if (!mod) {
      throw new ForgeError("NOT_FOUND", "Platform module not found");
    }
    return { product, mod };
  }

  async createModule(productCode: string, input: unknown) {
    const data = createPlatformModuleInputSchema.parse(input);
    const product = await this.db.query.platformProducts.findFirst({
      where: eq(platformProducts.code, productCode),
    });
    if (!product) {
      throw new ForgeError("NOT_FOUND", "Platform product not found");
    }
    const existing = await this.db.query.platformModules.findFirst({
      where: and(eq(platformModules.productId, product.id), eq(platformModules.code, data.code)),
    });
    if (existing) {
      throw new ForgeError("CONFLICT", "A module with this code already exists on the product");
    }
    const now = new Date();
    const [row] = await this.db
      .insert(platformModules)
      .values({
        id: createId(),
        productId: product.id,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        status: data.status,
        isCore: data.isCore,
        category: data.category,
        classification: data.classification,
        implementationStatus: data.implementationStatus,
        customerAssignable: data.customerAssignable,
        displayOrder: data.displayOrder,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) {
      throw new ForgeError("INTERNAL_ERROR", "Failed to create platform module");
    }
    return (await this.listModules(productCode, true)).find((m) => m.id === row.id)!;
  }

  async patchModule(productCode: string, moduleCode: string, input: unknown) {
    const data = patchPlatformModuleInputSchema.parse(input);
    const { product, mod } = await this.findModuleRow(productCode, moduleCode);
    const [updated] = await this.db
      .update(platformModules)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(platformModules.id, mod.id), eq(platformModules.productId, product.id)))
      .returning();
    if (!updated) {
      throw new ForgeError("INTERNAL_ERROR", "Failed to update platform module");
    }
    return (await this.listModules(productCode, true)).find((m) => m.id === updated.id)!;
  }

  async archiveModule(productCode: string, moduleCode: string) {
    return this.patchModule(productCode, moduleCode, { status: "ARCHIVED" });
  }

  async listPlans(includeArchived = false) {
    return this.db.query.subscriptionPlans.findMany({
      where: includeArchived ? undefined : eq(subscriptionPlans.status, "ACTIVE"),
      orderBy: (t, { asc: orderAsc }) => [orderAsc(t.code)],
    });
  }

  async getPlanByCode(planCode: string) {
    const plan = await this.db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, planCode),
    });
    if (!plan) {
      throw new ForgeError("NOT_FOUND", "Subscription plan not found");
    }
    const planPrices = await this.db.query.prices.findMany({
      where: eq(prices.planId, plan.id),
      orderBy: (t, { asc: orderAsc }) => [orderAsc(t.code)],
    });
    return { ...plan, prices: planPrices };
  }

  async createPlan(input: unknown) {
    const data = createSubscriptionPlanInputSchema.parse(input);
    const existing = await this.db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, data.code),
    });
    if (existing) {
      throw new ForgeError("CONFLICT", "A plan with this code already exists");
    }
    const now = new Date();
    const [row] = await this.db
      .insert(subscriptionPlans)
      .values({
        id: createId(),
        code: data.code,
        name: data.name,
        billingInterval: data.billingInterval,
        basePriceCents: data.basePriceCents ?? null,
        currency: data.currency,
        status: data.status,
        configurationJson: data.configurationJson ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) {
      throw new ForgeError("INTERNAL_ERROR", "Failed to create subscription plan");
    }
    return row;
  }

  async patchPlan(planCode: string, input: unknown) {
    const data = patchSubscriptionPlanInputSchema.parse(input);
    const before = await this.db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, planCode),
    });
    if (!before) {
      throw new ForgeError("NOT_FOUND", "Subscription plan not found");
    }
    const [updated] = await this.db
      .update(subscriptionPlans)
      .set({
        ...data,
        configurationJson: data.configurationJson ?? before.configurationJson,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPlans.id, before.id))
      .returning();
    if (!updated) {
      throw new ForgeError("INTERNAL_ERROR", "Failed to update subscription plan");
    }
    return updated;
  }

  async archivePlan(planCode: string) {
    return this.patchPlan(planCode, { status: "ARCHIVED" });
  }

  /**
   * Delete a subscription plan.
   * - Unused plans (no subscriptions): permanently remove plan + price tiers.
   * - In-use plans: soft-archive so existing subscriptions keep working.
   */
  async deletePlan(planCode: string) {
    const plan = await this.db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, planCode),
    });
    if (!plan) {
      throw new ForgeError("NOT_FOUND", "Subscription plan not found");
    }

    const [usage] = await this.db
      .select({ total: count() })
      .from(subscriptions)
      .where(eq(subscriptions.planId, plan.id));
    const subscriptionCount = Number(usage?.total ?? 0);

    if (subscriptionCount > 0) {
      const archived = await this.archivePlan(planCode);
      return {
        mode: "archived" as const,
        plan: archived,
        subscriptionCount,
        message: `Plan is used by ${subscriptionCount} subscription(s); archived instead of permanently deleted.`,
      };
    }

    const planPrices = await this.db
      .select({ id: prices.id })
      .from(prices)
      .where(eq(prices.planId, plan.id));
    const priceIds = planPrices.map((row) => row.id);

    await this.db.transaction(async (tx) => {
      if (priceIds.length > 0) {
        await tx
          .update(subscriptionItems)
          .set({ priceId: null, updatedAt: new Date() })
          .where(inArray(subscriptionItems.priceId, priceIds));
        await tx.delete(prices).where(eq(prices.planId, plan.id));
      }
      await tx.delete(subscriptionPlans).where(eq(subscriptionPlans.id, plan.id));
    });

    return {
      mode: "deleted" as const,
      plan: { id: plan.id, code: plan.code, name: plan.name },
      subscriptionCount: 0,
      message: `Plan ${plan.code} permanently deleted.`,
    };
  }

  async listPlanPrices(planCode: string, includeArchived = false) {
    const plan = await this.db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, planCode),
    });
    if (!plan) {
      throw new ForgeError("NOT_FOUND", "Subscription plan not found");
    }
    return this.db.query.prices.findMany({
      where: includeArchived
        ? eq(prices.planId, plan.id)
        : and(eq(prices.planId, plan.id), eq(prices.status, "ACTIVE")),
      orderBy: (t, { asc: orderAsc }) => [orderAsc(t.code)],
    });
  }

  async createPlanPrice(planCode: string, input: unknown) {
    const data = createPlanPriceInputSchema.parse(input);
    const plan = await this.db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, planCode),
    });
    if (!plan) {
      throw new ForgeError("NOT_FOUND", "Subscription plan not found");
    }
    const existing = await this.db.query.prices.findFirst({
      where: and(eq(prices.planId, plan.id), eq(prices.code, data.code)),
    });
    if (existing) {
      throw new ForgeError("CONFLICT", "A price with this code already exists on the plan");
    }
    const now = new Date();
    const [row] = await this.db
      .insert(prices)
      .values({
        id: createId(),
        planId: plan.id,
        code: data.code,
        nickname: data.nickname,
        interval: data.interval,
        amountCents: data.amountCents ?? null,
        currency: data.currency,
        billingType: data.billingType,
        status: data.status,
        configurationJson: data.configurationJson ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) {
      throw new ForgeError("INTERNAL_ERROR", "Failed to create plan price");
    }
    return row;
  }

  async patchPlanPrice(planCode: string, priceCode: string, input: unknown) {
    const data = patchPlanPriceInputSchema.parse(input);
    const plan = await this.db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, planCode),
    });
    if (!plan) {
      throw new ForgeError("NOT_FOUND", "Subscription plan not found");
    }
    const before = await this.db.query.prices.findFirst({
      where: and(eq(prices.planId, plan.id), eq(prices.code, priceCode)),
    });
    if (!before) {
      throw new ForgeError("NOT_FOUND", "Plan price not found");
    }
    const [updated] = await this.db
      .update(prices)
      .set({
        ...data,
        configurationJson: data.configurationJson ?? before.configurationJson,
        updatedAt: new Date(),
      })
      .where(eq(prices.id, before.id))
      .returning();
    if (!updated) {
      throw new ForgeError("INTERNAL_ERROR", "Failed to update plan price");
    }
    return updated;
  }

  async archivePlanPrice(planCode: string, priceCode: string) {
    return this.patchPlanPrice(planCode, priceCode, { status: "ARCHIVED" });
  }
}
