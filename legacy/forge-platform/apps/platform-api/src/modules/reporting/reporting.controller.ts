import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ForgeError } from "@forge/errors";
import { timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { AuthContextService } from "../auth-context/auth-context.service.js";
import { Principal, type AuthenticatedRequest } from "../auth-context/principal.decorator.js";
import { Public } from "../auth-context/public.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { ReportingService } from "./reporting.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };

const VIEW = [
  "industrial.reporting.view",
  "industrial.reporting.run",
  "industrial.reporting.export",
  "industrial.reporting.manage",
  "industrial.reporting.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const RUN = [
  "industrial.reporting.run",
  "industrial.reporting.manage",
  "industrial.reporting.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const EXPORT = [
  "industrial.reporting.export",
  "industrial.reporting.manage",
  "industrial.reporting.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const MANAGE = [
  "industrial.reporting.manage",
  "industrial.reporting.admin",
  "industrial.admin",
] as const;

const SCHEDULE = [
  "industrial.reporting.schedule",
  "industrial.reporting.manage",
  "industrial.reporting.admin",
  "industrial.admin",
] as const;

const SHARE = [
  "industrial.reporting.share",
  "industrial.reporting.manage",
  "industrial.reporting.admin",
  "industrial.admin",
] as const;

type ListQuery = Record<string, string | undefined>;

@Controller("api/v1/reporting")
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly authContext: AuthContextService,
  ) {}

  @Get("overview")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async overview(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.reporting.overview(principal), getRequestIds(req));
  }

  @Get("datasets")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  listDatasets(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(this.reporting.listDatasets(principal), getRequestIds(req));
  }

  @Get("datasets/:key")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  getDataset(
    @Principal() principal: ForgePrincipal,
    @Param("key") key: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(this.reporting.getDataset(principal, key), getRequestIds(req));
  }

  @Get("datasets/:key/fields")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  getDatasetFields(
    @Principal() principal: ForgePrincipal,
    @Param("key") key: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(this.reporting.getDatasetFields(principal, key), getRequestIds(req));
  }

  @Get("reports")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listReports(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    const filters: {
      search?: string;
      category?: string;
      module?: string;
      reportType?: string;
    } = {};
    if (query.search) filters.search = query.search;
    if (query.category) filters.category = query.category;
    if (query.module) filters.module = query.module;
    if (query.reportType) filters.reportType = query.reportType;
    return ok(await this.reporting.listReports(principal, filters), getRequestIds(req));
  }

  @Post("reports")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async createSaved(
    @Principal() principal: ForgePrincipal,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.createSaved(principal, body), getRequestIds(req));
  }

  @Post("reports/:key/run")
  @RequireAnyPermission([...RUN], { requiresEntitlement: ENTITLEMENT })
  async runReport(
    @Principal() principal: ForgePrincipal,
    @Param("key") key: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.runReport(principal, key, body), getRequestIds(req));
  }

  @Post("reports/:key/export")
  @RequireAnyPermission([...EXPORT], { requiresEntitlement: ENTITLEMENT })
  async exportReport(
    @Principal() principal: ForgePrincipal,
    @Param("key") key: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.exportReport(principal, key, body), getRequestIds(req));
  }

  @Patch("reports/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async patchSaved(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.patchSaved(principal, id, body), getRequestIds(req));
  }

  @Delete("reports/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async deleteSaved(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.deleteSaved(principal, id), getRequestIds(req));
  }

  @Post("reports/:key/favorite")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async favorite(
    @Principal() principal: ForgePrincipal,
    @Param("key") key: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.favorite(principal, key), getRequestIds(req));
  }

  @Delete("reports/:key/favorite")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async unfavorite(
    @Principal() principal: ForgePrincipal,
    @Param("key") key: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.unfavorite(principal, key), getRequestIds(req));
  }

  @Get("favorites")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listFavorites(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.reporting.listFavorites(principal), getRequestIds(req));
  }

  @Get("history")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listHistory(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.reporting.listHistory(principal), getRequestIds(req));
  }

  @Get("exports")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listExports(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.reporting.listExports(principal), getRequestIds(req));
  }

  @Post("exports/:id/download")
  @RequireAnyPermission([...EXPORT], { requiresEntitlement: ENTITLEMENT })
  async downloadExport(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.createExportDownload(principal, id), getRequestIds(req));
  }

  @Get("exports/:id/content")
  @RequireAnyPermission([...EXPORT], { requiresEntitlement: ENTITLEMENT })
  async exportContent(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const file = await this.reporting.getExportInlineContent(principal, id);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.status(200).send(file.body);
  }

  @Get("settings")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async settings(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.reporting.getSettings(principal), getRequestIds(req));
  }

  @Get("schedules")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listSchedules(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.reporting.listSchedules(principal), getRequestIds(req));
  }

  @Post("schedules/run-due")
  @RequireAnyPermission([...SCHEDULE], { requiresEntitlement: ENTITLEMENT })
  async runDueSchedules(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.reporting.runDueSchedules(principal), getRequestIds(req));
  }

  /**
   * Platform/worker sweep across tenants with due schedules.
   * Authorized by X-Forge-Reporting-Sweep-Token or platform admin session.
   */
  @Post("schedules/run-due-sweep")
  @Public()
  async runDueSchedulesSweep(
    @Headers("x-forge-reporting-sweep-token") sweepToken: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const authorized = await this.authorizeReportingSweep(req, sweepToken);
    if (!authorized) {
      throw new ForgeError("UNAUTHORIZED", "Reporting sweep token or platform admin required");
    }
    const ids = getRequestIds(req);
    const sweepIds = { correlationId: ids.correlationId, requestId: ids.requestId };
    let workersCompWeeklyStatus: unknown;
    try {
      workersCompWeeklyStatus = await this.reporting.migrateWorkersCompWeeklyStatusSchedules();
    } catch (error) {
      workersCompWeeklyStatus = {
        error:
          error instanceof Error ? error.message.slice(0, 500) : "Weekly status migration failed",
      };
    }
    const schedules = await this.reporting.runDueSchedulesSweep(sweepIds);
    return ok({ ...schedules, workersCompWeeklyStatus }, ids);
  }

  private async authorizeReportingSweep(
    req: AuthenticatedRequest,
    sweepToken: string | undefined,
  ): Promise<boolean> {
    const expected = (process.env.FORGE_REPORTING_SWEEP_TOKEN ?? "").trim();
    const provided = (sweepToken ?? "").trim();
    if (expected && provided) {
      const a = Buffer.from(expected);
      const b = Buffer.from(provided);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return true;
      }
    }

    try {
      const principal = req.principal ?? (await this.authContext.resolvePrincipal(req));
      req.principal = principal;
      return Boolean(principal.isPlatformAdmin);
    } catch {
      return false;
    }
  }

  @Post("schedules")
  @RequireAnyPermission([...SCHEDULE], { requiresEntitlement: ENTITLEMENT })
  async createSchedule(
    @Principal() principal: ForgePrincipal,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.createSchedule(principal, body), getRequestIds(req));
  }

  @Patch("schedules/:id")
  @RequireAnyPermission([...SCHEDULE], { requiresEntitlement: ENTITLEMENT })
  async patchSchedule(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.patchSchedule(principal, id, body), getRequestIds(req));
  }

  @Delete("schedules/:id")
  @RequireAnyPermission([...SCHEDULE], { requiresEntitlement: ENTITLEMENT })
  async deleteSchedule(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.deleteSchedule(principal, id), getRequestIds(req));
  }

  @Get("shares")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listShares(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.reporting.listShares(principal), getRequestIds(req));
  }

  @Post("shares")
  @RequireAnyPermission([...SHARE], { requiresEntitlement: ENTITLEMENT })
  async createShare(
    @Principal() principal: ForgePrincipal,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.createShare(principal, body), getRequestIds(req));
  }

  @Delete("shares/:id")
  @RequireAnyPermission([...SHARE], { requiresEntitlement: ENTITLEMENT })
  async deleteShare(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.reporting.deleteShare(principal, id), getRequestIds(req));
  }
}
