import { Controller, Get, Param, Req } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Public } from "../auth-context/public.decorator.js";
import { IndustrialExecutiveWalkthroughService } from "./industrial-executive-walkthrough.service.js";

@Controller("api/v1/public/executive-walkthrough")
export class IndustrialPublicExecutiveWalkthroughController {
  constructor(private readonly walkthrough: IndustrialExecutiveWalkthroughService) {}

  @Public()
  @Get("render/:token")
  async resolveRender(
    @Param("token") token: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.walkthrough.resolvePublicRenderToken(token), getRequestIds(req));
  }
}
