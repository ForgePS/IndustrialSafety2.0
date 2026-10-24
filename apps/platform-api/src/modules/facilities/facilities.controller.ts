import { Body, Controller, Get, Param, Patch, Post, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { FacilitiesService } from "./facilities.service.js";

@Controller("api/v1/tenants/:tenantId/facilities")
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Post()
  @RequirePermission("tenant.facilities.manage", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  @Idempotent({ resourceType: "facility" })
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.facilities.create(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get()
  @RequirePermission("tenant.facilities.read", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async list(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.facilities.list(tenantId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Get(":facilityId")
  @RequirePermission("tenant.facilities.read", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async get(
    @Param("tenantId") tenantId: string,
    @Param("facilityId") facilityId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.facilities.get(tenantId, facilityId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":facilityId")
  @RequirePermission("tenant.facilities.manage", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async patch(
    @Param("tenantId") tenantId: string,
    @Param("facilityId") facilityId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "facility");
    const data = await this.facilities.patch(tenantId, facilityId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }
}
