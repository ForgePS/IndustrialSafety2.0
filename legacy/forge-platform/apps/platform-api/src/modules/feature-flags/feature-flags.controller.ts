import { Body, Controller, Delete, Get, Param, Put, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { FeatureFlagsService } from "./feature-flags.service.js";

@Controller()
export class FeatureFlagsController {
  constructor(private readonly features: FeatureFlagsService) {}

  @Get("api/v1/platform/features")
  @RequirePermission("platform.feature.manage", { allowWhenSuspended: true })
  async listDefinitions(@Req() req: RequestWithIds) {
    return ok(await this.features.listDefinitions(), getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/features/effective")
  @RequirePermission("platform.tenant.read")
  async effective(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.features.effective(tenantId, principal), getRequestIds(req));
  }

  @Put("api/v1/tenants/:tenantId/features/:featureKey")
  @RequirePermission("platform.feature.manage")
  @Idempotent({ resourceType: "feature_flag" })
  async put(
    @Param("tenantId") tenantId: string,
    @Param("featureKey") featureKey: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.features.put(tenantId, featureKey, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Delete("api/v1/tenants/:tenantId/features/:featureKey")
  @RequirePermission("platform.feature.manage")
  async remove(
    @Param("tenantId") tenantId: string,
    @Param("featureKey") featureKey: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.features.remove(tenantId, featureKey, principal), getRequestIds(req));
  }
}
