import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Public } from "../auth-context/public.decorator.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";

/** Supervisor follow-up form opened from the observation email (no Forge login). */
@Controller("api/v1/public")
export class IndustrialPublicObservationsController {
  constructor(private readonly domain: IndustrialDomainService) {}

  @Get("observations/follow-up/:token")
  @Public()
  async getFollowUp(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.domain.getObservationFollowUpByToken(token), getRequestIds(req));
  }

  @Post("observations/follow-up/:token")
  @Public()
  async submitFollowUp(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.submitObservationFollowUpByToken(token, body ?? {}),
      getRequestIds(req),
    );
  }
}
