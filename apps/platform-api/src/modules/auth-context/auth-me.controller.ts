import { Body, Controller, Get, Patch, Post, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { z } from "zod";
import { ok } from "../../common/api-response.js";
import { ForgeError } from "@forge/errors";
import { parseETag, setETag } from "../../common/concurrency.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { AuthContextService } from "./auth-context.service.js";
import { AuthProfileService } from "./auth-profile.service.js";
import { AcknowledgmentService } from "../legal/acknowledgment.service.js";
import { Principal } from "./principal.decorator.js";

const selectTenantSchema = z.object({
  tenantId: z.string().uuid(),
  productCode: z.string().min(1).max(64).optional(),
  reason: z.string().min(1).max(256).optional(),
});

@Controller("api/v1/auth")
export class AuthMeController {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly profiles: AuthProfileService,
    private readonly acknowledgments: AcknowledgmentService,
  ) {}

  @Get("me")
  async me(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const tenants = await this.authContext.listAvailableTenants(principal.userId, {
      isPlatformAdmin: principal.isPlatformAdmin,
    });
    const accessMode = principal.isPlatformAdmin ? "PLATFORM_ADMIN_SUPPORT" : "MEMBER";
    let legalAcknowledgments: Awaited<ReturnType<AcknowledgmentService["summaryForMe"]>> | null =
      null;
    if (principal.activeProducts.has("FORGE_INDUSTRIAL")) {
      try {
        legalAcknowledgments = await this.acknowledgments.summaryForMe(
          principal.tenantId,
          principal,
        );
      } catch {
        legalAcknowledgments = null;
      }
    }
    return ok(
      {
        ...this.authContext.toClientSummary(principal, accessMode),
        tenants,
        ...(legalAcknowledgments ? { legalAcknowledgments } : {}),
      },
      getRequestIds(req),
    );
  }

  @Post("select-tenant")
  async selectTenant(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const parsed = selectTenantSchema.parse(body);
    const selected = await this.authContext.selectTenant(principal, parsed.tenantId, {
      ...(parsed.productCode ? { productCode: parsed.productCode } : {}),
      ...(parsed.reason ? { reason: parsed.reason } : {}),
    });
    const tenants = await this.authContext.listAvailableTenants(principal.userId, {
      isPlatformAdmin: principal.isPlatformAdmin,
    });
    return ok({ ...selected, tenants }, getRequestIds(req));
  }

  @Get("profile")
  async getProfile(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.profiles.get(principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("profile")
  async patchProfile(
    @Principal() principal: ForgePrincipal,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const header = req.header("if-match")?.trim() ?? "";
    let expected: number | "*" = "*";
    if (header && header !== "*") {
      const parsed = parseETag(header);
      if (parsed === null) {
        throw new ForgeError("BAD_REQUEST", "If-Match must be a record version ETag");
      }
      expected = parsed;
    }
    const data = await this.profiles.patch(principal, body, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("logout-all")
  async logoutAll(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.authContext.logoutAll(principal), getRequestIds(req));
  }
}
