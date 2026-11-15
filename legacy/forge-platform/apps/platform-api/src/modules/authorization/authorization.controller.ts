import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { AuthorizationService } from "./authorization.service.js";

@Controller()
export class AuthorizationController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get("api/v1/tenants/:tenantId/permissions")
  @RequirePermission("platform.permission.read")
  async listPermissions(@Req() req: RequestWithIds) {
    const data = await this.authorization.listPermissions();
    return ok(data, getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/roles")
  @RequirePermission("platform.role.assign")
  @Idempotent({ resourceType: "role" })
  async createRole(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authorization.createRole(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/roles")
  @RequirePermission("platform.permission.read")
  async listRoles(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.authorization.listRoles(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Get("api/v1/tenants/:tenantId/roles/:roleId")
  @RequirePermission("platform.permission.read")
  async getRole(
    @Param("tenantId") tenantId: string,
    @Param("roleId") roleId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authorization.getRole(tenantId, roleId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("api/v1/tenants/:tenantId/roles/:roleId")
  @RequirePermission("platform.role.assign")
  async patchRole(
    @Param("tenantId") tenantId: string,
    @Param("roleId") roleId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "role");
    const data = await this.authorization.patchRole(tenantId, roleId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Put("api/v1/tenants/:tenantId/roles/:roleId/permissions")
  @RequirePermission("platform.role.assign")
  async setPermissions(
    @Param("tenantId") tenantId: string,
    @Param("roleId") roleId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "role");
    const data = await this.authorization.setRolePermissions(
      tenantId,
      roleId,
      body,
      principal,
      expected,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/users/:userId/role-assignments")
  @RequirePermission("platform.role.assign")
  async assign(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.authorization.assignRole(tenantId, userId, body, principal),
      getRequestIds(req),
    );
  }

  @Delete("api/v1/tenants/:tenantId/users/:userId/role-assignments/:assignmentId")
  @RequirePermission("platform.role.assign")
  async revoke(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Param("assignmentId") assignmentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.authorization.revokeRole(tenantId, userId, assignmentId, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/authorization/check")
  @RequirePermission("platform.permission.read", { allowWhenSuspended: true })
  async check(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.authorization.check(body, principal), getRequestIds(req));
  }
}
