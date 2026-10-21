import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialPrintService } from "./industrial-print.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };

const VIEW = [
  "industrial.printer.view",
  "industrial.printer.print",
  "industrial.printer.manage",
  "industrial.printer.manage_bridge",
  "industrial.printer.manage_defaults",
  "industrial.printer.manage_media",
  "industrial.printer.manage_templates",
  "industrial.admin",
] as const;

const PRINT = [
  "industrial.printer.print",
  "industrial.printer.quick_print",
  "industrial.admin",
] as const;

const CANCEL = [
  "industrial.printer.cancel",
  "industrial.printer.print",
  "industrial.admin",
] as const;

const REPRINT = [
  "industrial.printer.reprint",
  "industrial.printer.print",
  "industrial.admin",
] as const;

const MANAGE_BRIDGE = ["industrial.printer.manage_bridge", "industrial.admin"] as const;

const MANAGE_PRINTERS = ["industrial.printer.manage", "industrial.admin"] as const;

const MANAGE_MEDIA = ["industrial.printer.manage_media", "industrial.admin"] as const;
/** Field operators with print can create saved sizes; patch/delete stay manage_media. */
const CREATE_MEDIA = [
  "industrial.printer.manage_media",
  "industrial.printer.print",
  "industrial.admin",
] as const;

const MANAGE_TEMPLATES = ["industrial.printer.manage_templates", "industrial.admin"] as const;

const MANAGE_DEFAULTS = [
  "industrial.printer.manage_defaults",
  "industrial.printer.manage",
  "industrial.admin",
] as const;

const PAIR_BLUETOOTH = [
  "industrial.printer.pair_bluetooth",
  "industrial.printer.manage",
  "industrial.admin",
] as const;

const RUN_DIAGNOSTICS = ["industrial.printer.run_diagnostics", "industrial.admin"] as const;

type ListQuery = Record<string, string | undefined>;

/**
 * Forge Print Service under /api/v1/industrial.
 * Registered before IndustrialFlatController catch-alls.
 */
@Controller("api/v1/industrial")
export class IndustrialPrintController {
  constructor(private readonly print: IndustrialPrintService) {}

  // ── Bridges ────────────────────────────────────────────────────────────

  @Post("printer-bridges/pair")
  @RequireAnyPermission([...MANAGE_BRIDGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_printer_bridge_pairing" })
  async createPairing(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.createPairingCode(principal, body ?? {}), getRequestIds(req));
  }

  @Get("printer-bridges")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listBridges(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.print.listBridges(principal), getRequestIds(req));
  }

  @Get("print-manager/summary")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async printManagerSummary(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.print.getPrintManagerSummary(principal), getRequestIds(req));
  }

  @Get("print-manager/analytics/summary")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async printAnalyticsSummary(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getPrintAnalyticsSummary(principal, query), getRequestIds(req));
  }

  @Get("print-manager/analytics/volume")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async printAnalyticsVolume(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getPrintAnalyticsVolume(principal, query), getRequestIds(req));
  }

  @Get("print-manager/analytics/failures")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async printAnalyticsFailures(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getPrintAnalyticsFailures(principal, query), getRequestIds(req));
  }

  @Get("print-manager/analytics/printers")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async printAnalyticsPrinters(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getPrintAnalyticsPrinters(principal, query), getRequestIds(req));
  }

  @Get("print-manager/supplies")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listPrintSupplies(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.print.listPrintSupplies(principal), getRequestIds(req));
  }

  @Post("print-manager/supplies")
  @RequireAnyPermission([...MANAGE_MEDIA], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_print_supply" })
  async createPrintSupply(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.createPrintSupply(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("print-manager/supplies/:id")
  @RequireAnyPermission([...MANAGE_MEDIA], { requiresEntitlement: ENTITLEMENT })
  async patchPrintSupply(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.patchPrintSupply(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("print-manager/supplies/:id/replace")
  @RequireAnyPermission([...MANAGE_MEDIA], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_print_supply_replace" })
  async replacePrintSupply(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.replacePrintSupply(principal, id, body ?? {}), getRequestIds(req));
  }

  @Delete("print-manager/supplies/:id")
  @RequireAnyPermission([...MANAGE_MEDIA], { requiresEntitlement: ENTITLEMENT })
  async deletePrintSupply(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.deletePrintSupply(principal, id), getRequestIds(req));
  }

  @Post("print-manager/resolve-route")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async resolvePrintRoute(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.resolvePrintRoutePreview(principal, body ?? {}), getRequestIds(req));
  }

  @Get("print-manager/printer-groups")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listPrinterGroups(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.print.listPrinterGroups(principal), getRequestIds(req));
  }

  @Post("print-manager/printer-groups")
  @RequireAnyPermission([...MANAGE_DEFAULTS], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_printer_group" })
  async createPrinterGroup(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.createPrinterGroup(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("print-manager/printer-groups/:id")
  @RequireAnyPermission([...MANAGE_DEFAULTS], { requiresEntitlement: ENTITLEMENT })
  async patchPrinterGroup(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.patchPrinterGroup(principal, id, body ?? {}), getRequestIds(req));
  }

  @Delete("print-manager/printer-groups/:id")
  @RequireAnyPermission([...MANAGE_DEFAULTS], { requiresEntitlement: ENTITLEMENT })
  async deletePrinterGroup(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.deletePrinterGroup(principal, id), getRequestIds(req));
  }

  @Get("print-manager/routing-rules")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listPrintRoutingRules(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.print.listPrintRoutingRules(principal), getRequestIds(req));
  }

  @Post("print-manager/routing-rules")
  @RequireAnyPermission([...MANAGE_DEFAULTS], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_print_routing_rule" })
  async createPrintRoutingRule(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.createPrintRoutingRule(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("print-manager/routing-rules/:id")
  @RequireAnyPermission([...MANAGE_DEFAULTS], { requiresEntitlement: ENTITLEMENT })
  async patchPrintRoutingRule(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.print.patchPrintRoutingRule(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Delete("print-manager/routing-rules/:id")
  @RequireAnyPermission([...MANAGE_DEFAULTS], { requiresEntitlement: ENTITLEMENT })
  async deletePrintRoutingRule(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.deletePrintRoutingRule(principal, id), getRequestIds(req));
  }

  // ── Label templates (Phase 4) ───────────────────────────────────────────

  @Get("label-templates")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listLabelTemplates(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.print.listLabelTemplates(principal), getRequestIds(req));
  }

  @Post("label-templates")
  @RequireAnyPermission([...MANAGE_TEMPLATES], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_label_template" })
  async createLabelTemplate(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.createLabelTemplate(principal, body ?? {}), getRequestIds(req));
  }

  @Get("label-templates/:id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getLabelTemplate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getLabelTemplate(principal, id), getRequestIds(req));
  }

  @Patch("label-templates/:id")
  @RequireAnyPermission([...MANAGE_TEMPLATES], { requiresEntitlement: ENTITLEMENT })
  async patchLabelTemplate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.patchLabelTemplate(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("label-templates/:id/draft")
  @RequireAnyPermission([...MANAGE_TEMPLATES], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_label_template_draft" })
  async createLabelTemplateDraft(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.createLabelTemplateDraft(principal, id), getRequestIds(req));
  }

  @Post("label-templates/:id/publish")
  @RequireAnyPermission([...MANAGE_TEMPLATES], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_label_template_publish" })
  async publishLabelTemplate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.print.publishLabelTemplate(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("label-templates/:id/preview")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async previewLabelTemplate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.print.previewLabelTemplate(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("label-templates/:id/export-zpl")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async exportLabelTemplateZpl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.print.exportLabelTemplateZpl(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Patch("label-templates/:id/versions/:versionId")
  @RequireAnyPermission([...MANAGE_TEMPLATES], { requiresEntitlement: ENTITLEMENT })
  async patchLabelTemplateVersion(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.print.patchLabelTemplateVersion(principal, id, versionId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("printer-bridges/:id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getBridge(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getBridge(principal, id), getRequestIds(req));
  }

  @Patch("printer-bridges/:id")
  @RequireAnyPermission([...MANAGE_BRIDGE], { requiresEntitlement: ENTITLEMENT })
  async updateBridge(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.updateBridge(principal, id, body ?? {}), getRequestIds(req));
  }

  @Delete("printer-bridges/:id")
  @RequireAnyPermission([...MANAGE_BRIDGE], { requiresEntitlement: ENTITLEMENT })
  async deleteBridge(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.deleteBridge(principal, id), getRequestIds(req));
  }

  // ── Printers ───────────────────────────────────────────────────────────

  @Post("printers/direct-bluetooth")
  @RequireAnyPermission([...PAIR_BLUETOOTH], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_printer_direct_bluetooth" })
  async registerDirectBluetooth(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.print.registerDirectBluetoothPrinter(principal, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("printers")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listPrinters(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.listPrinters(principal, query), getRequestIds(req));
  }

  @Get("printers/:id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getPrinter(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getPrinter(principal, id), getRequestIds(req));
  }

  @Patch("printers/:id")
  @RequireAnyPermission([...MANAGE_PRINTERS], { requiresEntitlement: ENTITLEMENT })
  async updatePrinter(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.updatePrinter(principal, id, body ?? {}), getRequestIds(req));
  }

  @Get("printers/:id/profile")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getPrinterProfile(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getPrinterProfile(principal, id), getRequestIds(req));
  }

  @Put("printers/:id/profile")
  @RequireAnyPermission([...MANAGE_DEFAULTS], { requiresEntitlement: ENTITLEMENT })
  async upsertPrinterProfile(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.print.upsertPrinterProfile(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("printers/:id/health")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getPrinterHealth(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getPrinterHealth(principal, id), getRequestIds(req));
  }

  @Post("printers/:id/diagnostics")
  @RequireAnyPermission([...RUN_DIAGNOSTICS], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_printer_diagnostics" })
  async runDiagnostics(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.runDiagnostics(principal, id), getRequestIds(req));
  }

  @Post("printers/:id/test")
  @RequireAnyPermission([...PRINT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_printer_test_print" })
  async testPrint(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.testPrint(principal, id), getRequestIds(req));
  }

  @Post("printers/:id/reconnect")
  @RequireAnyPermission([...PAIR_BLUETOOTH], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_printer_reconnect" })
  async reconnectPrinter(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.reconnectPrinter(principal, id), getRequestIds(req));
  }

  @Post("printers/:id/forget")
  @RequireAnyPermission([...PAIR_BLUETOOTH], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_printer_forget_bluetooth" })
  async forgetPrinter(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.forgetBluetoothPrinter(principal, id), getRequestIds(req));
  }

  // ── Media profiles ─────────────────────────────────────────────────────

  @Get("printer-media-profiles")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listMediaProfiles(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.print.listMediaProfiles(principal), getRequestIds(req));
  }

  @Post("printer-media-profiles")
  @RequireAnyPermission([...CREATE_MEDIA], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_printer_media_profile" })
  async createMediaProfile(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.createMediaProfile(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("printer-media-profiles/:id")
  @RequireAnyPermission([...MANAGE_MEDIA], { requiresEntitlement: ENTITLEMENT })
  async patchMediaProfile(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.print.patchMediaProfile(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Delete("printer-media-profiles/:id")
  @RequireAnyPermission([...MANAGE_MEDIA], { requiresEntitlement: ENTITLEMENT })
  async deleteMediaProfile(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.deleteMediaProfile(principal, id), getRequestIds(req));
  }

  // ── Print batches ──────────────────────────────────────────────────────

  @Post("print-batches")
  @RequireAnyPermission([...PRINT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_print_batch" })
  async createBatch(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.createPrintBatch(principal, body ?? {}), getRequestIds(req));
  }

  @Get("print-batches")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listBatches(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.print.listPrintBatches(principal), getRequestIds(req));
  }

  @Get("print-batches/:id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getBatch(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getPrintBatch(principal, id), getRequestIds(req));
  }

  // ── Print jobs ─────────────────────────────────────────────────────────

  @Post("print-jobs/preview")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async previewJob(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.previewPrintJob(principal, body ?? {}), getRequestIds(req));
  }

  @Post("print-jobs")
  @RequireAnyPermission([...PRINT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_print_job" })
  async createJob(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.createPrintJob(principal, body ?? {}), getRequestIds(req));
  }

  @Get("print-jobs")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listJobs(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.print.listJobs(principal, query);
    return ok(data, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("print-jobs/:id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getJob(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.getJob(principal, id), getRequestIds(req));
  }

  @Get("print-jobs/:id/artifact")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getJobArtifact(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const file = await this.print.getJobArtifact(principal, id);
    const safeName =
      file.filename.replace(/"/g, "").replace(/[^\w.\-() ]+/g, "_").slice(0, 180) || "label.png";
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    if (file.contentLength) {
      res.setHeader("Content-Length", String(file.contentLength));
    }
    file.body.pipe(res);
  }

  @Post("print-jobs/:id/status")
  @RequireAnyPermission([...PRINT], { requiresEntitlement: ENTITLEMENT })
  async updateJobStatus(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.print.onAuthenticatedJobStatus(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("print-jobs/:id/cancel")
  @RequireAnyPermission([...CANCEL], { requiresEntitlement: ENTITLEMENT })
  async cancelJob(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.cancelJob(principal, id), getRequestIds(req));
  }

  @Post("print-jobs/:id/retry")
  @RequireAnyPermission([...PRINT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_print_job_retry" })
  async retryJob(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.retryJob(principal, id), getRequestIds(req));
  }

  @Post("print-jobs/:id/reprint")
  @RequireAnyPermission([...REPRINT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_print_job_reprint" })
  async reprintJob(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.print.reprintJob(principal, id, body ?? {}), getRequestIds(req));
  }
}
