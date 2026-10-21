import { Inject, Injectable } from "@nestjs/common";
import {
  INDUSTRIAL_MODULE_REGISTRY,
  INDUSTRIAL_PRODUCT_CODE,
  industrialAvailabilityLabel,
  industrialModuleIsToggleable,
} from "@forge/contracts";
import {
  createId,
  membershipModuleAccess,
  platformModules,
  platformProducts,
  userTenantMemberships,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";

export type CompanyModuleRow = {
  code: string;
  name: string;
  group: string;
  implementationStatus: string;
  availabilityLabel: string;
  enabled: boolean;
  entitlementStatus: string;
  toggleable: boolean;
};

@Injectable()
export class IndustrialSettingsModulesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly entitlements: EntitlementsService,
  ) {}

  private tenantId(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  async listCompanyModules(principal: ForgePrincipal): Promise<{
    productEntitled: boolean;
    modules: CompanyModuleRow[];
  }> {
    const tenantId = this.tenantId(principal);
    const data = await this.entitlements.list(tenantId);
    const productEntitled = data.products.some(
      (p) => p.productCode === INDUSTRIAL_PRODUCT_CODE && String(p.status).toUpperCase() === "ACTIVE",
    );
    const entitlementByCode = new Map(
      data.modules
        .filter((m) => m.productCode === INDUSTRIAL_PRODUCT_CODE)
        .map((m) => [m.moduleCode, m]),
    );

    const modules = INDUSTRIAL_MODULE_REGISTRY.filter((m) => m.code !== "CORE").map((mod) => {
      const ent = entitlementByCode.get(mod.code);
      const entitlementStatus = ent?.status ?? "OFF";
      const enabled = String(entitlementStatus).toUpperCase() === "ACTIVE";
      const toggleable = industrialModuleIsToggleable(mod);
      return {
        code: mod.code,
        name: mod.name,
        group: mod.group,
        implementationStatus: mod.implementationStatus,
        availabilityLabel: industrialAvailabilityLabel(mod.implementationStatus),
        enabled,
        entitlementStatus,
        toggleable,
      };
    });

    return { productEntitled, modules };
  }

  async setModuleEnabled(
    principal: ForgePrincipal,
    moduleCode: string,
    enabled: boolean,
  ): Promise<CompanyModuleRow> {
    const tenantId = this.tenantId(principal);
    const code = moduleCode.trim().toUpperCase();
    const entry = INDUSTRIAL_MODULE_REGISTRY.find((m) => m.code === code);
    if (!entry || entry.code === "CORE") {
      throw new ForgeError("NOT_FOUND", "Module not found");
    }
    if (!industrialModuleIsToggleable(entry)) {
      throw new ForgeError(
        "CONFLICT",
        `${entry.name} cannot be enabled until it is ready.`,
      );
    }

    await this.entitlements.putModule(
      tenantId,
      code,
      {
        status: enabled ? "ACTIVE" : "SUSPENDED",
        productCode: INDUSTRIAL_PRODUCT_CODE,
        sourceType: "TENANT_ADMIN",
      },
      principal,
    );

    if (enabled) {
      await this.grantMembershipAccess(tenantId, code, principal.userId);
    }

    const listed = await this.listCompanyModules(principal);
    const row = listed.modules.find((m) => m.code === code);
    if (!row) throw new ForgeError("NOT_FOUND", "Module row missing after update");
    return row;
  }

  /** Ensure every ACTIVE tenant membership can use the module once entitled. */
  private async grantMembershipAccess(tenantId: string, moduleCode: string, actorUserId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const product = await tx.query.platformProducts.findFirst({
        where: eq(platformProducts.code, INDUSTRIAL_PRODUCT_CODE),
      });
      if (!product) return;
      const mod = await tx.query.platformModules.findFirst({
        where: and(eq(platformModules.productId, product.id), eq(platformModules.code, moduleCode)),
      });
      if (!mod) return;

      const memberships = await tx
        .select({ id: userTenantMemberships.id })
        .from(userTenantMemberships)
        .where(
          and(
            eq(userTenantMemberships.tenantId, tenantId),
            eq(userTenantMemberships.status, "ACTIVE"),
          ),
        );

      const now = new Date();
      for (const membership of memberships) {
        const existing = await tx.query.membershipModuleAccess.findFirst({
          where: and(
            eq(membershipModuleAccess.membershipId, membership.id),
            eq(membershipModuleAccess.moduleId, mod.id),
          ),
        });
        if (existing) {
          if (existing.status !== "ACTIVE") {
            await tx
              .update(membershipModuleAccess)
              .set({ status: "ACTIVE", updatedAt: now })
              .where(eq(membershipModuleAccess.id, existing.id));
          }
          continue;
        }
        await tx.insert(membershipModuleAccess).values({
          id: createId(),
          tenantId,
          membershipId: membership.id,
          moduleId: mod.id,
          status: "ACTIVE",
          grantedByUserId: actorUserId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }, actorUserId);
  }
}
