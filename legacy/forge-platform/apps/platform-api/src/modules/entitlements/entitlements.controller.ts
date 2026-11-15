import { Body, Controller, Get, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { EntitlementsService } from "./entitlements.service.js";

@Controller("api/v1/tenants/:tenantId")
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get("entitlements")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async list(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.entitlements.list(tenantId), getRequestIds(req));
  }

  @Put("products/:productCode")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  @Idempotent({ resourceType: "entitlement" })
  async putProduct(
    @Param("tenantId") tenantId: string,
    @Param("productCode") productCode: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.entitlements.putProduct(tenantId, productCode, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Put("products/:productCode/modules")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  @Idempotent({ resourceType: "entitlement" })
  async putProductModules(
    @Param("tenantId") tenantId: string,
    @Param("productCode") productCode: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.entitlements.putProductModules(tenantId, productCode, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Put("modules/:moduleCode/entitlement")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  @Idempotent({ resourceType: "entitlement" })
  async putModule(
    @Param("tenantId") tenantId: string,
    @Param("moduleCode") moduleCode: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.entitlements.putModule(tenantId, moduleCode, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("modules/:moduleCode/suspend")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async suspend(
    @Param("tenantId") tenantId: string,
    @Param("moduleCode") moduleCode: string,
    @Query("productCode") productCode: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "entitlement");
    const data = await this.entitlements.setModuleStatus(
      tenantId,
      moduleCode,
      "SUSPENDED",
      principal,
      expected,
      productCode,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("modules/:moduleCode/activate")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async activate(
    @Param("tenantId") tenantId: string,
    @Param("moduleCode") moduleCode: string,
    @Query("productCode") productCode: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "entitlement");
    const data = await this.entitlements.setModuleStatus(
      tenantId,
      moduleCode,
      "ACTIVE",
      principal,
      expected,
      productCode,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }
}
