import { Body, Controller, Delete, Get, Post, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { WebPushService } from "./web-push.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
const ACCESS = ["industrial.access", "industrial.admin", "field.access"] as const;

@Controller("api/v1/industrial/push")
export class WebPushController {
  constructor(private readonly push: WebPushService) {}

  @Get("vapid-public-key")
  @RequireAnyPermission([...ACCESS], {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async vapidPublicKey(@Req() req: RequestWithIds) {
    return ok(this.push.getPublicKey(), getRequestIds(req));
  }

  @Get("subscriptions")
  @RequireAnyPermission([...ACCESS], {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async list(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const items = await this.push.listForUser(principal);
    return ok({ enabled: this.push.isEnabled(), items }, getRequestIds(req));
  }

  @Post("subscriptions")
  @RequireAnyPermission([...ACCESS], {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async subscribe(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const keys =
      body.keys && typeof body.keys === "object"
        ? (body.keys as { p256dh?: string; auth?: string })
        : undefined;
    const payload: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      userAgent?: string;
    } = {};
    if (typeof body.endpoint === "string") payload.endpoint = body.endpoint;
    if (keys) payload.keys = keys;
    if (typeof body.userAgent === "string") payload.userAgent = body.userAgent;
    const data = await this.push.upsertSubscription(principal, payload);
    return ok(data, getRequestIds(req));
  }

  @Delete("subscriptions")
  @RequireAnyPermission([...ACCESS], {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async unsubscribe(
    @Principal() principal: ForgePrincipal,
    @Query("endpoint") endpoint: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const ep =
      (typeof endpoint === "string" && endpoint) ||
      (typeof body.endpoint === "string" ? body.endpoint : "");
    return ok(await this.push.disableSubscription(principal, ep), getRequestIds(req));
  }
}
