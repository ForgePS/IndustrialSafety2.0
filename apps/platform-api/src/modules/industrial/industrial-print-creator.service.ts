import { Injectable } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ForgeError } from "@forge/errors";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service.js";
import { IndustrialPrintService } from "./industrial-print.service.js";
import { computeCreatorPrintingEnabled } from "./industrial-print-creator.util.js";

const PRINTING_FEATURE_KEYS = [
  "forge.printing.enabled",
  "forge.printing.print_manager.enabled",
  "forge.printing.bridge.enabled",
  "forge.printing.bluetooth.enabled",
  "forge.printing.directBluetooth.enabled",
  "forge.printing.batch.enabled",
  "forge.printing.failover.enabled",
  "forge.printing.analytics.enabled",
  "forge.printing.supplies.enabled",
  "industrial.module.print_manager.enabled",
  "industrial.module.print_queue.enabled",
  "industrial.module.print_history.enabled",
] as const;

function asScopedPrincipal(principal: ForgePrincipal, tenantId: string): ForgePrincipal {
  return { ...principal, tenantId };
}

function monthRangeUtc(now = new Date()): { from: string; to: string } {
  const to = now.toISOString();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  return { from: from.toISOString(), to };
}

@Injectable()
export class IndustrialPrintCreatorService {
  constructor(
    private readonly print: IndustrialPrintService,
    private readonly entitlements: EntitlementsService,
    private readonly features: FeatureFlagsService,
  ) {}

  private assertCreatorAccess(principal: ForgePrincipal): void {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("platform.tenant.read") &&
      !principal.permissions.has("platform.entitlement.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Creator print health requires platform tenant access");
    }
  }

  /**
   * Tenant print health for Forge Creator — reuses Industrial Print Manager summary
   * with entitlement + feature flag context for support diagnostics.
   */
  async getPrintHealth(principal: ForgePrincipal, tenantId: string) {
    this.assertCreatorAccess(principal);
    if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
      throw new ForgeError("BAD_REQUEST", "Valid tenantId is required");
    }

    const scoped = asScopedPrincipal(principal, tenantId);
    const range = monthRangeUtc();

    const [summary, analytics, entitlements, effectiveFeatures] = await Promise.all([
      this.print.getPrintManagerSummary(scoped),
      this.print.getPrintAnalyticsSummary(scoped, {
        from: range.from,
        to: range.to,
      }),
      this.entitlements.list(tenantId),
      this.features.effective(tenantId, scoped),
    ]);

    const product = entitlements.products.find((p) => p.productCode === "FORGE_INDUSTRIAL");
    const printManagerModule = entitlements.modules.find((m) => m.moduleCode === "PRINT_MANAGER");
    const flagMap: Record<string, { value: unknown; overridden: boolean; name?: string }> = {};
    for (const key of PRINTING_FEATURE_KEYS) {
      const row = effectiveFeatures.find((f) => f.key === key);
      if (row) {
        flagMap[key] = {
          value: row.value,
          overridden: Boolean(row.overridden),
          name: row.name,
        };
      }
    }

    const bridgeVersions = [
      ...new Set(
        (summary.bridgeHealth ?? [])
          .map((b: { version?: string | null }) => String(b.version ?? "").trim())
          .filter(Boolean),
      ),
    ].sort();

    const printingEnabled = computeCreatorPrintingEnabled({
      productStatus: product?.status ?? "NOT_ENTITLED",
      printManagerModuleStatus: printManagerModule?.status ?? "NOT_ENTITLED",
      forgePrintingEnabled: flagMap["forge.printing.enabled"]?.value,
      printManagerFlagEnabled: flagMap["forge.printing.print_manager.enabled"]?.value,
    });

    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      printingEnabled: Boolean(printingEnabled),
      entitlement: {
        productCode: "FORGE_INDUSTRIAL",
        productStatus: product?.status ?? "NOT_ENTITLED",
        printManagerModuleStatus: printManagerModule?.status ?? "NOT_ENTITLED",
      },
      flags: flagMap,
      summary,
      usage: {
        period: "month_to_date",
        from: analytics.from,
        to: analytics.to,
        jobs: analytics.totals.jobs,
        completed: analytics.totals.completed,
        failed: analytics.totals.failed,
        labelsPrinted: analytics.totals.labelsPrinted,
        failureRate: analytics.totals.failureRate,
        retryRate: analytics.totals.retryRate,
        reprints: analytics.totals.reprints,
      },
      bridges: {
        total: summary.bridges.total,
        online: summary.bridges.online,
        offline: summary.bridges.offline,
        versions: bridgeVersions,
        items: (summary.bridgeHealth ?? []).map(
          (b: {
            id: string;
            name: string;
            version?: string | null;
            status: string;
            enabled: boolean;
            lastSeenAt?: string | null;
            printerCount?: number;
            pendingJobs?: number;
            computerName?: string | null;
          }) => ({
            id: b.id,
            name: b.name,
            computerName: b.computerName ?? null,
            version: b.version ?? null,
            status: b.status,
            enabled: b.enabled,
            lastSeenAt: b.lastSeenAt ?? null,
            printerCount: b.printerCount ?? 0,
            pendingJobs: b.pendingJobs ?? 0,
          }),
        ),
      },
      printers: {
        total: summary.printers.total,
        online: summary.printers.online,
        offline: summary.printers.offline,
        warning: summary.printers.warning,
        error: summary.printers.error,
      },
      diagnostics: {
        recentErrors: summary.recentErrors ?? [],
        supplies: summary.supplies ?? null,
        batches: summary.batches ?? null,
        jobsToday: summary.jobs,
      },
    };
  }
}
