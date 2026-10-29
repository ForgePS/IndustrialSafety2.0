import { Body, Controller, Get, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { z } from "zod";
import { ok } from "../../common/api-response.js";
import { ForgeError } from "@forge/errors";
import { parseETag, setETag } from "../../common/concurrency.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { isDemoTenant } from "../../common/demo-tenant.js";
import { AuthContextService } from "./auth-context.service.js";
import { AuthProfileService } from "./auth-profile.service.js";
import { AcknowledgmentService } from "../legal/acknowledgment.service.js";
import { Principal } from "./principal.decorator.js";
import { Inject } from "@nestjs/common";
import { DATABASE } from "../../tokens.js";
import type { Database } from "@forge/database";

const selectTenantSchema = z.object({
  tenantId: z.string().uuid(),
  productCode: z.string().min(1).max(64).optional(),
  reason: z.string().min(1).max(256).optional(),
});

const profileUserQuerySchema = z.object({
  userId: z.string().uuid().optional(),
});

@Controller("api/v1/auth")
export class AuthMeController {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly profiles: AuthProfileService,
    private readonly acknowledgments: AcknowledgmentService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get("me")
  async me(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const tenants = await this.authContext.listAvailableTenants(principal.userId, {
      isPlatformAdmin: principal.isPlatformAdmin,
    });
    const accessMode = principal.isPlatformAdmin ? "PLATFORM_ADMIN_SUPPORT" : "MEMBER";
    const demo = await isDemoTenant(this.db, principal.tenantId);
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
        isDemoTenant: demo,
        tenants: tenants.map((t) => ({
          ...t,
          isDemoTenant: t.tenantId === principal.tenantId ? demo : false,
        })),
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
    const demo = await isDemoTenant(this.db, selected.tenantId ?? principal.tenantId);
    return ok(
      {
        ...selected,
        isDemoTenant: demo,
        tenants: tenants.map((t) => ({
          ...t,
          isDemoTenant: t.tenantId === (selected.tenantId ?? principal.tenantId) ? demo : false,
        })),
      },
      getRequestIds(req),
    );
  }

  @Get("profile")
  async getProfile(
    @Principal() principal: ForgePrincipal,
    @Query() query: unknown,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = profileUserQuerySchema.parse(query ?? {});
    const data = await this.profiles.get(principal, parsed.userId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("profile")
  async patchProfile(
    @Principal() principal: ForgePrincipal,
    @Query() query: unknown,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = profileUserQuerySchema.parse(query ?? {});
    const header = req.header("if-match")?.trim() ?? "";
    let expected: number | "*" = "*";
    if (header && header !== "*") {
      const version = parseETag(header);
      if (version === null) {
        throw new ForgeError("BAD_REQUEST", "If-Match must be a record version ETag");
      }
      expected = version;
    }
    const data = await this.profiles.patch(principal, body, expected, parsed.userId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("logout-all")
  async logoutAll(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.authContext.logoutAll(principal), getRequestIds(req));
  }
}
