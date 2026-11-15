import { Body, Controller, Get, Param, Patch, Post, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller("api/v1/tenants/:tenantId/organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @RequirePermission("platform.organization.create")
  @Idempotent({ resourceType: "organization" })
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.organizations.create(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get()
  @RequirePermission("platform.organization.read")
  async list(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.organizations.list(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Get(":organizationId")
  @RequirePermission("platform.organization.read")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("organizationId") organizationId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.organizations.get(tenantId, organizationId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":organizationId")
  @RequirePermission("platform.organization.create")
  async patch(
    @Param("tenantId") tenantId: string,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "organization");
    const data = await this.organizations.patch(
      tenantId,
      organizationId,
      body,
      principal,
      expected,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":organizationId/archive")
  @RequirePermission("platform.organization.create")
  async archive(
    @Param("tenantId") tenantId: string,
    @Param("organizationId") organizationId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "organization");
    const data = await this.organizations.archive(tenantId, organizationId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }
}
