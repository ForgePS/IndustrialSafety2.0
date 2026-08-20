import { Controller, Get, Header, Query, Req } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Public } from "../auth-context/public.decorator.js";
import { LoginBrandingService } from "./login-branding.service.js";

@Controller()
export class PublicBrandingController {
  constructor(private readonly loginBranding: LoginBrandingService) {}

  /** Pre-auth Sign-in branding resolved by vanity hostname → tenant_domains. */
  @Get("api/v1/public/login-branding")
  @Public()
  @Header("Cache-Control", "public, max-age=60")
  async loginBrandingByHost(
    @Query("host") host: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.loginBranding.byHost(host);
    return ok(data, getRequestIds(req));
  }
}
