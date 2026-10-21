import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Public } from "../auth-context/public.decorator.js";
import { WalkthroughStudioService } from "./walkthrough-studio.service.js";

@Controller("api/v1/public/walkthrough")
export class WalkthroughStudioPublicController {
  constructor(private readonly studio: WalkthroughStudioService) {}

  @Public()
  @Get("share/:token")
  async resolveShare(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.studio.resolvePublicShare(token), getRequestIds(req));
  }

  @Public()
  @Post("share/:token/unlock")
  async unlockShare(
    @Param("token") token: string,
    @Body() body: { pin?: string },
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.unlockPublicShare(token, body?.pin), getRequestIds(req));
  }
}
