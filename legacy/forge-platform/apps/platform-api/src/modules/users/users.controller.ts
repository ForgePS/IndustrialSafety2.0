import { Body, Controller, Get, Param, Patch, Post, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { UsersService } from "./users.service.js";

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post("api/v1/tenants/:tenantId/users/invitations")
  @RequirePermission("platform.user.invite")
  @Idempotent({ resourceType: "user_invitation" })
  async invite(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.users.invite(tenantId, body, principal), getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/users")
  @RequirePermission("platform.user.invite")
  async list(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.users.list(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Get("api/v1/tenants/:tenantId/users/:userId")
  @RequirePermission("platform.user.invite")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.users.get(tenantId, userId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("api/v1/tenants/:tenantId/users/:userId")
  @RequirePermission("platform.user.invite")
  async patch(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "user");
    const data = await this.users.patch(tenantId, userId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/users/:userId/reset-password")
  @RequireAnyPermission([
    "platform.user.invite",
    "platform.invitation.manage",
    "platform.membership.manage",
  ])
  async resetPassword(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.users.sendPasswordReset(tenantId, userId, principal), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/users/:userId/disable")
  @RequirePermission("platform.user.invite")
  async disable(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "user");
    const data = await this.users.disable(tenantId, userId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/users/:userId/enable")
  @RequirePermission("platform.user.invite")
  async enable(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "user");
    const data = await this.users.enable(tenantId, userId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }
}
