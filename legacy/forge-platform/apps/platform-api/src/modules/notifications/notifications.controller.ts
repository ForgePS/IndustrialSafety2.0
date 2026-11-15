import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { NotificationsService } from "./notifications.service.js";

@Controller("api/v1/tenants/:tenantId/notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermission("tenant.notification.read", { allowWhenSuspended: true })
  async list(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Query("limit") limitRaw: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const limit = limitRaw ? Number(limitRaw) : 50;
    const data = await this.notifications.listForUser(tenantId, principal.userId, limit);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Get("unread-count")
  @RequirePermission("tenant.notification.read", { allowWhenSuspended: true })
  async unreadCount(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const count = await this.notifications.unreadCount(tenantId, principal.userId);
    return ok({ count }, getRequestIds(req));
  }

  @Post("read-all")
  @RequirePermission("tenant.notification.read", { allowWhenSuspended: true })
  async markAllRead(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const updated = await this.notifications.markAllRead(tenantId, principal.userId);
    return ok({ updated }, getRequestIds(req));
  }

  @Post(":notificationId/read")
  @RequirePermission("tenant.notification.read", { allowWhenSuspended: true })
  async markRead(
    @Param("tenantId") tenantId: string,
    @Param("notificationId") notificationId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const row = await this.notifications.markRead(tenantId, principal.userId, notificationId);
    return ok(row, getRequestIds(req));
  }

  @Post()
  @RequirePermission("tenant.notification.manage", { allowWhenSuspended: true })
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.notifications.create(tenantId, body, principal);
    return ok(data, getRequestIds(req));
  }
}
