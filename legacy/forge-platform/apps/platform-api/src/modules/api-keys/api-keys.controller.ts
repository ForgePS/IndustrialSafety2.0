import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { ApiKeysService } from "./api-keys.service.js";

@Controller("api/v1/tenants/:tenantId/api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequirePermission("tenant.api_key.read")
  async list(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.apiKeys.list(tenantId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Post()
  @RequirePermission("tenant.api_key.manage")
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.apiKeys.create(tenantId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Post(":keyId/revoke")
  @RequirePermission("tenant.api_key.manage")
  async revoke(
    @Param("tenantId") tenantId: string,
    @Param("keyId") keyId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.apiKeys.revoke(tenantId, keyId, principal);
    return ok(data, getRequestIds(req));
  }
}
