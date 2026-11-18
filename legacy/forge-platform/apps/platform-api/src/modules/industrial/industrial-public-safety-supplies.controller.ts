import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Public } from "../auth-context/public.decorator.js";
import { IndustrialSupplyRequestQrService } from "./industrial-supply-request-qr.service.js";

@Controller("api/v1/public/safety-supplies")
export class IndustrialPublicSafetySuppliesController {
  constructor(private readonly supplyQr: IndustrialSupplyRequestQrService) {}

  @Get("request/:token")
  @Public()
  async resolve(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.supplyQr.resolvePublicStation(token), getRequestIds(req));
  }

  @Post("request/:token/employee")
  @Public()
  async employee(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.lookupPublicEmployee(token, body ?? {}), getRequestIds(req));
  }

  @Get("request/:token/items")
  @Public()
  async items(
    @Param("token") token: string,
    @Query() query: Record<string, string | undefined>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.listPublicItems(token, query ?? {}), getRequestIds(req));
  }

  @Post("request/:token/requests")
  @Public()
  async createRequest(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.createPublicRequest(token, body ?? {}), getRequestIds(req));
  }

  @Get("request-status/:statusToken")
  @Public()
  async status(@Param("statusToken") statusToken: string, @Req() req: RequestWithIds) {
    return ok(await this.supplyQr.getPublicRequestStatus(statusToken), getRequestIds(req));
  }
}
