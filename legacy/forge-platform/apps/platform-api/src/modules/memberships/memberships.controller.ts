import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { z } from "zod";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { MembershipsService } from "./memberships.service.js";

const reasonSchema = z.object({ reason: z.string().min(1).max(2000) });

@Controller("api/v1/tenants/:tenantId/memberships")
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @RequirePermission("platform.membership.read")
  async list(
    @Param("tenantId") tenantId: string,
    @Query("status") status: string | undefined,
    @Query("userId") userId: string | undefined,
    @Query("q") q: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.memberships.list(tenantId, { status, userId, q });
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Post()
  @RequirePermission("platform.membership.manage")
  @Idempotent({ resourceType: "membership" })
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.memberships.create(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get(":membershipId")
  @RequirePermission("platform.membership.read")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.memberships.get(tenantId, membershipId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":membershipId")
  @RequirePermission("platform.membership.manage")
  async patch(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "membership");
    const data = await this.memberships.patch(tenantId, membershipId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":membershipId/activate")
  @RequirePermission("platform.membership.manage")
  async activate(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "membership");
    const data = await this.memberships.activate(tenantId, membershipId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":membershipId/suspend")
  @RequirePermission("platform.membership.manage")
  async suspend(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "membership");
    const { reason } = reasonSchema.parse(body);
    const data = await this.memberships.suspend(
      tenantId,
      membershipId,
      reason,
      principal,
      expected,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":membershipId/revoke")
  @RequirePermission("platform.membership.manage")
  async revoke(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "membership");
    const { reason } = reasonSchema.parse(body);
    const data = await this.memberships.revoke(tenantId, membershipId, reason, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get(":membershipId/roles")
  @RequirePermission("platform.membership.read")
  async listRoles(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.memberships.getRoles(tenantId, membershipId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Put(":membershipId/roles")
  @RequireAnyPermission(["platform.membership.manage", "industrial.admin"])
  async setRoles(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const expected = requireIfMatch(req, "membership");
    const data = await this.memberships.setRoles(tenantId, membershipId, body, principal, expected);
    return ok(data, getRequestIds(req));
  }

  @Get(":membershipId/products")
  @RequirePermission("platform.membership.read")
  async listProducts(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.memberships.getProducts(tenantId, membershipId), getRequestIds(req));
  }

  @Put(":membershipId/products")
  @RequireAnyPermission(["platform.membership.manage", "industrial.admin"])
  async setProducts(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const expected = requireIfMatch(req, "membership");
    const data = await this.memberships.setProducts(
      tenantId,
      membershipId,
      body,
      principal,
      expected,
    );
    return ok(data, getRequestIds(req));
  }

  @Put(":membershipId/facilities")
  @RequirePermission("platform.membership.manage")
  async setFacilityScope(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const expected = requireIfMatch(req, "membership");
    const data = await this.memberships.setFacilityScope(
      tenantId,
      membershipId,
      body,
      principal,
      expected,
    );
    return ok(data, getRequestIds(req));
  }

  @Get(":membershipId/history")
  @RequirePermission("platform.membership.read")
  async history(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.memberships.getHistory(tenantId, membershipId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }
}
