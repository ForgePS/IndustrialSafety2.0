import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialExecutiveWalkthroughService } from "./industrial-executive-walkthrough.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
const VIEW = [
  "industrial.presentation.executive.view",
  "industrial.presentation.executive.manage",
  "industrial.presentation.executive.export",
  "industrial.admin",
  "industrial.access",
] as const;
const MANAGE = ["industrial.presentation.executive.manage", "industrial.admin"] as const;
const EXPORT = [
  "industrial.presentation.executive.export",
  "industrial.presentation.executive.manage",
  "industrial.admin",
  "industrial.access",
] as const;
const DELETE_EXPORT = [
  "industrial.presentation.executive.delete_export",
  "industrial.presentation.executive.manage",
  "industrial.admin",
] as const;

@Controller("api/v1/industrial/executive-walkthrough")
export class IndustrialExecutiveWalkthroughController {
  constructor(private readonly walkthrough: IndustrialExecutiveWalkthroughService) {}

  @Get()
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getConfig(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.walkthrough.getConfig(principal), getRequestIds(req));
  }

  @Post("validate")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async validate(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.walkthrough.validate(principal), getRequestIds(req));
  }

  @Get("settings")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getSettings(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.walkthrough.getSettings(principal), getRequestIds(req));
  }

  @Patch("settings")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateSettings(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.walkthrough.updateSettings(principal, body), getRequestIds(req));
  }

  @Post("narration/ensure")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async ensureNarration(@Principal() principal: ForgePrincipal, @Body() body: Record<string, unknown>, @Req() req: RequestWithIds) {
    return ok(await this.walkthrough.ensureNarration(principal, body ?? {}), getRequestIds(req));
  }

  @Post("exports")
  @RequireAnyPermission([...EXPORT], { requiresEntitlement: ENTITLEMENT })
  async createExport(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.walkthrough.createExport(principal, body), getRequestIds(req));
  }

  @Get("exports")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listExports(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.walkthrough.listExports(principal), getRequestIds(req));
  }

  @Get("exports/:exportId")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getExport(
    @Principal() principal: ForgePrincipal,
    @Param("exportId") exportId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.walkthrough.getExport(principal, exportId), getRequestIds(req));
  }

  @Get("exports/:exportId/download")
  @RequireAnyPermission([...EXPORT], { requiresEntitlement: ENTITLEMENT })
  async downloadExport(
    @Principal() principal: ForgePrincipal,
    @Param("exportId") exportId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.walkthrough.downloadExport(principal, exportId), getRequestIds(req));
  }

  @Delete("exports/:exportId")
  @RequireAnyPermission([...DELETE_EXPORT], { requiresEntitlement: ENTITLEMENT })
  async deleteExport(
    @Principal() principal: ForgePrincipal,
    @Param("exportId") exportId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.walkthrough.deleteExport(principal, exportId), getRequestIds(req));
  }

  @Post("events")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async trackEvent(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.walkthrough.trackEvent(principal, body), getRequestIds(req));
  }
}
