import { Inject, Injectable } from "@nestjs/common";
import {
  INDUSTRIAL_MODULE_REGISTRY,
  INDUSTRIAL_PRODUCT_CODE,
} from "@forge/contracts";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service.js";

/**
 * Bootstrap / readiness for flat industrial-web contract.
 * Forward-ported from diverged branch onto master Model A.
 */
@Injectable()
export class IndustrialBootstrapService {
  constructor(@Inject(FeatureFlagsService) private readonly flags: FeatureFlagsService) {}

  private featureFlagKeyForModule(code: string): string {
    if (code === "CORE" || code === "IMPORT") return "industrial.enabled";
    if (code === "JSAS") return "industrial.module.jsa.enabled";
    if (code === "QR_LINKS") return "industrial.module.qr_links.enabled";
    if (code === "LOCKOUT_TAGOUT") return "industrial.module.loto.enabled";
    if (code === "DOT_COMPLIANCE") return "industrial.module.dot.enabled";
    if (code === "WORKERS_COMP") return "industrial.module.workers_comp.enabled";
    if (code === "EMERGENCY_RESPONSE") return "industrial.module.emergency_response.enabled";
    return `industrial.module.${code.toLowerCase()}.enabled`;
  }

  private assertIndustrialAccess(principal: ForgePrincipal): void {
    if (principal.isPlatformAdmin) return;
    if (principal.permissions.has("industrial.access")) return;
    throw new ForgeError("FORBIDDEN", "industrial.access permission is required");
  }

  private isProductEntitled(principal: ForgePrincipal): boolean {
    return principal.activeProducts.has(INDUSTRIAL_PRODUCT_CODE);
  }

  async bootstrap(principal: ForgePrincipal) {
    this.assertIndustrialAccess(principal);
    if (!this.isProductEntitled(principal) && !principal.isPlatformAdmin) {
      throw new ForgeError("FORBIDDEN", "Tenant is not entitled to Forge Industrial Safety");
    }

    const effective = await this.flags.effective(principal.tenantId, principal);
    const flagMap = Object.fromEntries(effective.map((f) => [f.key, Boolean(f.value)]));
    const industrialEnabled = Boolean(flagMap["industrial.enabled"]);

    const modules = INDUSTRIAL_MODULE_REGISTRY.map((entry) => {
      const featureFlagKey = this.featureFlagKeyForModule(entry.code);
      const flagOn = Boolean(flagMap[featureFlagKey]);
      const awsEnabled = entry.code === "CORE" ? industrialEnabled : flagOn;
      return {
        code: entry.code,
        name: entry.name,
        group: entry.group,
        route: entry.route,
        migrationStatus: entry.migrationStatus,
        featureFlagKey,
        awsEnabled,
      };
    });

    return {
      productCode: INDUSTRIAL_PRODUCT_CODE,
      industrialEnabled,
      entitled: this.isProductEntitled(principal) || principal.isPlatformAdmin,
      modules,
      flags: flagMap,
    };
  }

  async readiness(principal: ForgePrincipal) {
    this.assertIndustrialAccess(principal);
    const entitled = this.isProductEntitled(principal) || principal.isPlatformAdmin;
    const boot = entitled
      ? await this.bootstrap(principal)
      : { industrialEnabled: false, productCode: INDUSTRIAL_PRODUCT_CODE };

    return {
      status: boot.industrialEnabled ? "ready" : "disabled",
      productCode: INDUSTRIAL_PRODUCT_CODE,
      industrialEnabled: Boolean(boot.industrialEnabled),
      entitled,
    };
  }
}
