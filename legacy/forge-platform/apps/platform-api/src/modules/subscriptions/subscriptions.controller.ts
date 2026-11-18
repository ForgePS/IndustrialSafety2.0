import { Body, Controller, Get, Param, Patch, Post, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { SubscriptionsService } from "./subscriptions.service.js";

@Controller("api/v1/tenants/:tenantId/subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post()
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  @Idempotent({ resourceType: "subscription" })
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.subscriptions.create(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get()
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async list(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.subscriptions.list(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Get("current")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async current(
    @Param("tenantId") tenantId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.subscriptions.current(tenantId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":subscriptionId")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async patch(
    @Param("tenantId") tenantId: string,
    @Param("subscriptionId") subscriptionId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "subscription");
    const data = await this.subscriptions.patch(
      tenantId,
      subscriptionId,
      body,
      principal,
      expected,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":subscriptionId/suspend")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async suspend(
    @Param("tenantId") tenantId: string,
    @Param("subscriptionId") subscriptionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "subscription");
    const data = await this.subscriptions.suspend(tenantId, subscriptionId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":subscriptionId/reactivate")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async reactivate(
    @Param("tenantId") tenantId: string,
    @Param("subscriptionId") subscriptionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "subscription");
    const data = await this.subscriptions.reactivate(tenantId, subscriptionId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }
}
