import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { WalkthroughStudioService } from "./walkthrough-studio.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
const VIEW = [
  "industrial.walkthrough.view",
  "industrial.walkthrough.manage",
  "industrial.presentation.executive.view",
  "industrial.admin",
  "industrial.access",
] as const;
const MANAGE = [
  "industrial.walkthrough.manage",
  "industrial.presentation.executive.manage",
  "industrial.admin",
] as const;
const DEMO = [
  "industrial.walkthrough.demo.manage",
  "industrial.walkthrough.demo.reset",
  "industrial.admin",
] as const;
const SHARE = [
  "industrial.walkthrough.share.manage",
  "industrial.walkthrough.manage",
  "industrial.admin",
] as const;
const GENERATE = [
  "industrial.walkthrough.videos.generate",
  "industrial.presentation.executive.export",
  "industrial.walkthrough.manage",
  "industrial.admin",
] as const;
const ANALYTICS = [
  "industrial.walkthrough.analytics.view",
  "industrial.walkthrough.view",
  "industrial.admin",
] as const;

@Controller("api/v1/industrial/walkthrough-studio")
export class WalkthroughStudioController {
  constructor(private readonly studio: WalkthroughStudioService) {}

  @Get()
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async list(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.studio.listWalkthroughs(principal), getRequestIds(req));
  }

  @Get("voices")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async voices(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.studio.listVoices(principal), getRequestIds(req));
  }

  @Post("voices/preview")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async previewVoice(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.previewVoice(principal, body ?? {}), getRequestIds(req));
  }

  @Get("demo")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async demo(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.studio.getDemoEnvironment(principal), getRequestIds(req));
  }

  @Post("demo/enable")
  @RequireAnyPermission([...DEMO], { requiresEntitlement: ENTITLEMENT })
  async enableDemo(
    @Principal() principal: ForgePrincipal,
    @Body() body: { enabled?: boolean },
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.studio.enableDemoMode(principal, body?.enabled !== false),
      getRequestIds(req),
    );
  }

  @Post("demo/reset")
  @RequireAnyPermission([...DEMO], { requiresEntitlement: ENTITLEMENT })
  async resetDemo(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.studio.resetDemo(principal), getRequestIds(req));
  }

  @Get("demo/seed-status")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async seedStatus(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.studio.getDemoSeedStatus(principal), getRequestIds(req));
  }

  @Get("exports")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listExports(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.studio.listExports(principal), getRequestIds(req));
  }

  @Post("exports")
  @RequireAnyPermission([...GENERATE], { requiresEntitlement: ENTITLEMENT })
  async createExport(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.createExport(principal, body ?? {}), getRequestIds(req));
  }

  @Get("exports/:exportId/download")
  @RequireAnyPermission([...GENERATE], { requiresEntitlement: ENTITLEMENT })
  async downloadExport(
    @Principal() principal: ForgePrincipal,
    @Param("exportId") exportId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.downloadExport(principal, exportId), getRequestIds(req));
  }

  @Get("analytics")
  @RequireAnyPermission([...ANALYTICS], { requiresEntitlement: ENTITLEMENT })
  async analytics(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.studio.getAnalytics(principal), getRequestIds(req));
  }

  @Post("events")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async events(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.trackEvent(principal, body ?? {}), getRequestIds(req));
  }

  @Get(":walkthroughId")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getOne(
    @Principal() principal: ForgePrincipal,
    @Param("walkthroughId") walkthroughId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.getWalkthrough(principal, walkthroughId), getRequestIds(req));
  }

  @Post(":walkthroughId/validate")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async validate(
    @Principal() principal: ForgePrincipal,
    @Param("walkthroughId") _walkthroughId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.validateWalkthrough(principal), getRequestIds(req));
  }

  @Patch(":walkthroughId/scenes")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async patchScene(
    @Principal() principal: ForgePrincipal,
    @Param("walkthroughId") _walkthroughId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.updateSceneNarration(principal, body ?? {}), getRequestIds(req));
  }

  @Get(":walkthroughId/share-links")
  @RequireAnyPermission([...SHARE], { requiresEntitlement: ENTITLEMENT })
  async listShares(
    @Principal() principal: ForgePrincipal,
    @Param("walkthroughId") _walkthroughId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.listShareLinks(principal), getRequestIds(req));
  }

  @Post(":walkthroughId/share-links")
  @RequireAnyPermission([...SHARE], { requiresEntitlement: ENTITLEMENT })
  async createShare(
    @Principal() principal: ForgePrincipal,
    @Param("walkthroughId") walkthroughId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.studio.createShareLink(principal, walkthroughId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post(":walkthroughId/share-links/:shareLinkId/revoke")
  @RequireAnyPermission([...SHARE], { requiresEntitlement: ENTITLEMENT })
  async revokeShare(
    @Principal() principal: ForgePrincipal,
    @Param("walkthroughId") _walkthroughId: string,
    @Param("shareLinkId") shareLinkId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.studio.revokeShareLink(principal, shareLinkId), getRequestIds(req));
  }
}
