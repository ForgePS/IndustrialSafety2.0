import { Body, Controller, Get, Param, Patch, Post, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { TenantsService } from "./tenants.service.js";

@Controller("api/v1/platform/tenants")
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @RequirePermission("platform.tenant.create", { allowWhenSuspended: true })
  @Idempotent({ resourceType: "tenant" })
  async create(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.tenants.create(body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get()
  @RequirePermission("platform.tenant.read", { allowWhenSuspended: true })
  async list(@Req() req: RequestWithIds) {
    const data = await this.tenants.list();
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Get(":tenantId")
  @RequirePermission("platform.tenant.read", { allowWhenSuspended: true })
  async get(
    @Param("tenantId") tenantId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.tenants.getById(tenantId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":tenantId")
  @RequirePermission("platform.tenant.update", { allowWhenSuspended: true })
  async patch(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "tenant");
    const data = await this.tenants.patch(tenantId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":tenantId/activate")
  @RequirePermission("platform.tenant.suspend", { allowWhenSuspended: true })
  async activate(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "tenant");
    const data = await this.tenants.activate(tenantId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":tenantId/start-trial")
  @RequirePermission("platform.tenant.update", { allowWhenSuspended: true })
  async startTrial(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "tenant");
    const data = await this.tenants.startTrial(tenantId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":tenantId/suspend")
  @RequirePermission("platform.tenant.suspend", { allowWhenSuspended: true })
  async suspend(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "tenant");
    const data = await this.tenants.suspend(tenantId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":tenantId/archive")
  @RequirePermission("platform.tenant.update", { allowWhenSuspended: true })
  async archive(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "tenant");
    const data = await this.tenants.archive(tenantId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":tenantId/cancel")
  @RequirePermission("platform.tenant.suspend", { allowWhenSuspended: true })
  async cancel(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "tenant");
    const data = await this.tenants.cancel(tenantId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }
}
