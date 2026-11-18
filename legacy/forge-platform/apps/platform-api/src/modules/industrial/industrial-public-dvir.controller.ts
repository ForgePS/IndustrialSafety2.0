import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Public } from "../auth-context/public.decorator.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";

@Controller("api/v1/public")
export class IndustrialPublicDvirController {
  constructor(private readonly domain: IndustrialDomainService) {}

  @Get("dvir/:token")
  @Public()
  async getDvir(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.domain.getDvirContextByToken(token), getRequestIds(req));
  }

  @Get("dvir/:token/dvirs")
  @Public()
  async listDvirs(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.domain.listDvirsByToken(token), getRequestIds(req));
  }

  @Get("dvir/:token/dvirs/:dvirId/printable")
  @Public()
  async printableDvir(
    @Param("token") token: string,
    @Param("dvirId") dvirId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.dvirPrintableByToken(token, dvirId), getRequestIds(req));
  }

  @Get("dvir/:token/dvirs/day/:date/printable")
  @Public()
  async printableDay(
    @Param("token") token: string,
    @Param("date") date: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.dvirDayPrintableByToken(token, date), getRequestIds(req));
  }

  @Post("dvir/:token")
  @Public()
  async submitDvir(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.submitDvirByToken(token, body ?? {}), getRequestIds(req));
  }

  @Post("dvir/:token/driver-review")
  @Public()
  async certifyDvirDriverReview(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.certifyDvirDriverReviewByToken(token, body ?? {}),
      getRequestIds(req),
    );
  }
}
