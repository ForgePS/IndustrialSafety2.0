import { Controller, Get, Param, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialPrintCreatorService } from "./industrial-print-creator.service.js";

/**
 * Forge Creator (platform) view of tenant Print Manager health.
 * Does not expose printer CRUD — Industrial owns operational print surfaces.
 */
@Controller("api/v1/platform/tenants/:tenantId/industrial")
export class IndustrialPrintCreatorController {
  constructor(private readonly creatorPrint: IndustrialPrintCreatorService) {}

  @Get("print-health")
  @RequireAnyPermission(["platform.tenant.read", "platform.entitlement.manage"], {
    allowWhenSuspended: true,
  })
  async printHealth(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.creatorPrint.getPrintHealth(principal, tenantId), getRequestIds(req));
  }

  /** Alias for support tooling that expects a diagnostics path. */
  @Get("print-diagnostics")
  @RequireAnyPermission(["platform.tenant.read", "platform.entitlement.manage"], {
    allowWhenSuspended: true,
  })
  async printDiagnostics(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.creatorPrint.getPrintHealth(principal, tenantId), getRequestIds(req));
  }
}
