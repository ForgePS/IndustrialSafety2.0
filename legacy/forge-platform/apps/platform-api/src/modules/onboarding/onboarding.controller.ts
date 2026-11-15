import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { OnboardingService } from "./onboarding.service.js";

@Controller("api/v1/platform/onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get("templates")
  @RequirePermission("platform.onboarding.manage", { allowWhenSuspended: true })
  async templates(@Req() req: RequestWithIds) {
    const data = this.onboarding.listTemplates();
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Post("sessions")
  @RequirePermission("platform.onboarding.manage", { allowWhenSuspended: true })
  @Idempotent({ resourceType: "onboarding_session" })
  async start(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.onboarding.start(body, principal);
    setETag(res, data.session.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get("sessions")
  @RequirePermission("platform.onboarding.manage", { allowWhenSuspended: true })
  async list(@Req() req: RequestWithIds) {
    const data = await this.onboarding.listSessions();
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Get("sessions/:sessionId")
  @RequirePermission("platform.onboarding.manage", { allowWhenSuspended: true })
  async get(
    @Param("sessionId") sessionId: string,
    @Query("tenantId") tenantId: string | undefined,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.onboarding.getSession(sessionId, tenantId);
    setETag(res, data.session.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("sessions/:sessionId/steps/:stepKey/complete")
  @RequirePermission("platform.onboarding.manage", { allowWhenSuspended: true })
  async completeStep(
    @Param("sessionId") sessionId: string,
    @Param("stepKey") stepKey: string,
    @Query("tenantId") tenantId: string | undefined,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "onboarding_session");
    const data = await this.onboarding.completeStep(
      sessionId,
      stepKey,
      body,
      principal,
      expected,
      tenantId,
    );
    setETag(res, data.session.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("sessions/:sessionId/activate")
  @RequirePermission("platform.onboarding.manage", { allowWhenSuspended: true })
  async activate(
    @Param("sessionId") sessionId: string,
    @Query("tenantId") tenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "onboarding_session");
    const data = await this.onboarding.activate(sessionId, principal, expected, tenantId);
    setETag(res, data.session.recordVersion);
    return ok(data, getRequestIds(req));
  }
}
