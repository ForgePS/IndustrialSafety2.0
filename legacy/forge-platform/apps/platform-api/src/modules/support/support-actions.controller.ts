import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ForgeError } from "@forge/errors";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { SupportActionsService } from "./support-actions.service.js";

const supportActionInputSchema = z.object({
  actionType: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  metadata: z.record(z.unknown()).optional(),
});

@Controller("api/v1/tenants/:tenantId/support-actions")
export class SupportActionsController {
  constructor(private readonly support: SupportActionsService) {}

  @Post()
  @RequirePermission("platform.tenant.update")
  async record(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    if (!principal.isPlatformAdmin) {
      throw new ForgeError("FORBIDDEN", "Support actions require a platform admin principal");
    }
    const data = supportActionInputSchema.parse(body);
    const row = await this.support.record(
      tenantId,
      {
        actionType: data.actionType,
        summary: data.summary,
        ...(data.metadata ? { metadata: data.metadata } : {}),
      },
      principal,
    );
    return ok(row, getRequestIds(req));
  }
}
