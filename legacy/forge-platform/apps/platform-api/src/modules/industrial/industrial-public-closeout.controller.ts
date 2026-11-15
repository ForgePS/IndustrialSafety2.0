import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Public } from "../auth-context/public.decorator.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";
import { Req } from "@nestjs/common";

@Controller("api/v1/public")
export class IndustrialPublicCloseoutController {
  constructor(private readonly domain: IndustrialDomainService) {}

  @Get("corrective-actions/closeout/:token")
  @Public()
  async getCloseout(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.domain.getCloseoutByToken(token), getRequestIds(req));
  }

  @Post("corrective-actions/closeout/:token")
  @Public()
  async submitCloseout(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.submitCloseoutByToken(token, body ?? {}), getRequestIds(req));
  }
}
