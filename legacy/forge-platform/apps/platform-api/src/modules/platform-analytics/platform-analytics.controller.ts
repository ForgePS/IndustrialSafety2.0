import { Controller, Get, Req } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { PlatformAnalyticsService } from "./platform-analytics.service.js";

@Controller("api/v1/platform/analytics")
export class PlatformAnalyticsController {
  constructor(private readonly analytics: PlatformAnalyticsService) {}

  @Get("overview")
  @RequirePermission("platform.analytics.read")
  async overview(@Req() req: RequestWithIds) {
    return ok(await this.analytics.overview(), getRequestIds(req));
  }
}
