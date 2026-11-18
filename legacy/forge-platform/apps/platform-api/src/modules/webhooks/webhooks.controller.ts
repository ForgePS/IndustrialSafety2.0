import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { WebhooksService } from "./webhooks.service.js";

@Controller("api/v1/tenants/:tenantId/webhooks")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @RequirePermission("tenant.webhook.read")
  async list(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.webhooks.listEndpoints(tenantId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Post()
  @RequirePermission("tenant.webhook.manage")
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.webhooks.createEndpoint(tenantId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Patch(":endpointId")
  @RequirePermission("tenant.webhook.manage")
  async patch(
    @Param("tenantId") tenantId: string,
    @Param("endpointId") endpointId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.webhooks.patchEndpoint(tenantId, endpointId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Get(":endpointId/deliveries")
  @RequirePermission("tenant.webhook.read")
  async listDeliveries(
    @Param("tenantId") tenantId: string,
    @Param("endpointId") endpointId: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.webhooks.listDeliveries(tenantId, endpointId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Post(":endpointId/deliveries")
  @RequirePermission("tenant.webhook.manage")
  async createDelivery(
    @Param("tenantId") tenantId: string,
    @Param("endpointId") endpointId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.webhooks.createDelivery(tenantId, endpointId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Post(":endpointId/deliveries/:deliveryId/replay")
  @RequirePermission("tenant.webhook.manage")
  async replay(
    @Param("tenantId") tenantId: string,
    @Param("endpointId") endpointId: string,
    @Param("deliveryId") deliveryId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.webhooks.replayDelivery(tenantId, endpointId, deliveryId, principal);
    return ok(data, getRequestIds(req));
  }
}
