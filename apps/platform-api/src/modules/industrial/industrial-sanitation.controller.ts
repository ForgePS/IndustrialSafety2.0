import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialSanitationService } from "./industrial-sanitation.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
type ListQuery = Record<string, string | undefined>;

const VIEW = ["industrial.sanitation.view", "industrial.access", "industrial.admin"] as const;
const MANAGE = ["industrial.sanitation.manage", "industrial.admin"] as const;
const INSPECT = [
  "industrial.sanitation.inspect",
  "industrial.sanitation.manage",
  "industrial.admin",
] as const;
const CLEAN = [
  "industrial.sanitation.clean",
  "industrial.sanitation.manage",
  "industrial.admin",
] as const;
const VERIFY = [
  "industrial.sanitation.verify",
  "industrial.sanitation.manage",
  "industrial.admin",
] as const;
const REPORT = [
  "industrial.sanitation.report",
  "industrial.sanitation.manage",
  "industrial.sanitation.view",
  "industrial.access",
  "industrial.admin",
] as const;
const FINDING_UPDATE = [
  "industrial.sanitation.manage",
  "industrial.sanitation.inspect",
  "industrial.admin",
] as const;
const CLEAN_OR_MANAGE = [
  "industrial.sanitation.clean",
  "industrial.sanitation.manage",
  "industrial.admin",
] as const;
const PEST_FINDING_CREATE = [
  "industrial.sanitation.inspect",
  "industrial.sanitation.manage",
  "industrial.sanitation.report",
  "industrial.admin",
] as const;
const COMPRESSED_AIR_CREATE = [
  "industrial.sanitation.report",
  "industrial.sanitation.manage",
  "industrial.sanitation.view",
  "industrial.access",
  "industrial.admin",
  "industrial.sanitation.clean",
] as const;

/**
 * Grain facility sanitation under /api/v1/industrial/sanitation.
 * Registered before IndustrialFlatController catch-alls.
 */
@Controller("api/v1/industrial/sanitation")
export class IndustrialSanitationController {
  constructor(private readonly sanitation: IndustrialSanitationService) {}

  // ── Dashboard ────────────────────────────────────────────────────────────

  @Get("dashboard")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async dashboard(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.getDashboard(principal, query), getRequestIds(req));
  }

  @Get("analytics")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async analytics(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.getAnalytics(principal, query), getRequestIds(req));
  }

  @Get("heat-map")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async heatMap(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.getHeatMap(principal, query), getRequestIds(req));
  }

  @Get("regulatory-library")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async regulatoryLibrary(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.sanitation.listRegulatoryLibrary(principal), getRequestIds(req));
  }

  @Get("export")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async exportCsvQuery(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    const kind = String(query.kind ?? "").trim();
    return ok(await this.sanitation.exportCsv(principal, kind, query), getRequestIds(req));
  }

  @Get("export/:kind")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async exportCsvKind(
    @Principal() principal: ForgePrincipal,
    @Param("kind") kind: string,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.exportCsv(principal, kind, query), getRequestIds(req));
  }

  @Post("audit-package")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async auditPackage(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.getAuditPackage(principal, body ?? {}), getRequestIds(req));
  }

  // ── Profiles ─────────────────────────────────────────────────────────────

  @Get("profiles")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listProfiles(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listProfiles(principal, query), getRequestIds(req));
  }

  @Post("profiles")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_profiles" })
  async upsertProfile(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.upsertProfile(principal, body ?? {}), getRequestIds(req));
  }

  // ── Zones ────────────────────────────────────────────────────────────────

  @Get("zones")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listZones(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listZones(principal, query), getRequestIds(req));
  }

  @Post("zones")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_zones" })
  async createZone(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createZone(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("zones/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateZone(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.updateZone(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("zones/:id/archive")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveZone(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.archiveZone(principal, id), getRequestIds(req));
  }

  // ── Locations ────────────────────────────────────────────────────────────

  @Get("locations")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listLocations(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listLocations(principal, query), getRequestIds(req));
  }

  @Post("locations")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_locations" })
  async createLocation(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createLocation(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("locations/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateLocation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.updateLocation(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("locations/:id/archive")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveLocation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.archiveLocation(principal, id), getRequestIds(req));
  }

  @Post("locations/:id/qr")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async generateLocationQr(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.generateLocationQrToken(principal, id), getRequestIds(req));
  }

  @Get("resolve-qr/location/:token")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async resolveLocationQr(
    @Principal() principal: ForgePrincipal,
    @Param("token") token: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.resolveLocationByQr(principal, token), getRequestIds(req));
  }

  @Get("resolve-qr/pest-device/:token")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async resolvePestDeviceQr(
    @Principal() principal: ForgePrincipal,
    @Param("token") token: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.resolvePestDeviceByQr(principal, token), getRequestIds(req));
  }

  // ── Templates ────────────────────────────────────────────────────────────

  @Get("templates")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listTemplates(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listTemplates(principal, query), getRequestIds(req));
  }

  @Post("templates/ensure-builtin")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async ensureBuiltinTemplates(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.sanitation.ensureBuiltinTemplates(principal), getRequestIds(req));
  }

  @Post("templates")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_templates" })
  async createTemplate(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createTemplate(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("templates/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateTemplate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.updateTemplate(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("templates/:id/archive")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveTemplate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.archiveTemplate(principal, id), getRequestIds(req));
  }

  // ── Inspections ──────────────────────────────────────────────────────────

  @Get("inspections")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listInspections(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listInspections(principal, query), getRequestIds(req));
  }

  @Get("inspections/:id/printable")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getInspectionPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.getInspectionPrintable(principal, id), getRequestIds(req));
  }

  @Get("report-recipients")
  @RequireAnyPermission([...REPORT], { requiresEntitlement: ENTITLEMENT })
  async listReportRecipients(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.sanitation.listReportRecipients(principal), getRequestIds(req));
  }

  @Post("inspections/:id/email-pdf")
  @RequireAnyPermission([...REPORT], { requiresEntitlement: ENTITLEMENT })
  async emailInspectionPdf(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.emailInspectionPdf(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("inspections/:id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getInspection(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.getInspection(principal, id), getRequestIds(req));
  }

  @Post("inspections")
  @RequireAnyPermission([...INSPECT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_inspections" })
  async startInspection(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.startInspection(principal, body ?? {}), getRequestIds(req));
  }

  @Post("inspections/:id/responses")
  @RequireAnyPermission([...INSPECT], { requiresEntitlement: ENTITLEMENT })
  async saveInspectionResponses(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.saveInspectionResponses(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("inspections/:id/complete")
  @RequireAnyPermission([...INSPECT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_inspection_complete" })
  async completeInspection(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.completeInspection(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("inspections/:id/delete")
  @RequireAnyPermission([...INSPECT], { requiresEntitlement: ENTITLEMENT })
  async deleteInspection(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.deleteInspection(principal, id), getRequestIds(req));
  }

  // ── Findings ─────────────────────────────────────────────────────────────

  @Get("findings")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listFindings(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listFindings(principal, query), getRequestIds(req));
  }

  @Post("findings")
  @RequireAnyPermission([...INSPECT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_findings" })
  async createFinding(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createFinding(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("findings/:id")
  @RequireAnyPermission([...FINDING_UPDATE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateFindingStatus(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.updateFindingStatus(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  // ── Dust ─────────────────────────────────────────────────────────────────

  @Get("dust-measurements")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listDustMeasurements(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listDustMeasurements(principal, query), getRequestIds(req));
  }

  @Post("dust-measurements")
  @RequireAnyPermission([...INSPECT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_dust" })
  async recordDustMeasurement(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.recordDustMeasurement(principal, body ?? {}),
      getRequestIds(req),
    );
  }

  // ── Master Sanitation Schedule ───────────────────────────────────────────

  @Get("mss")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listMss(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listMss(principal, query), getRequestIds(req));
  }

  @Post("mss")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_mss" })
  async createMss(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createMss(principal, body ?? {}), getRequestIds(req));
  }

  @Post("mss/generate-tasks")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async generateCleaningTasksFromDue(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.generateCleaningTasksFromDue(principal), getRequestIds(req));
  }

  @Patch("mss/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateMss(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.updateMss(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("mss/:id/archive")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveMss(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.archiveMss(principal, id), getRequestIds(req));
  }

  // ── Cleaning tasks ───────────────────────────────────────────────────────

  @Get("cleaning-tasks")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listCleaningTasks(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listCleaningTasks(principal, query), getRequestIds(req));
  }

  @Get("cleaning-tasks/:id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getCleaningTask(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.getCleaningTask(principal, id), getRequestIds(req));
  }

  @Post("cleaning-tasks")
  @RequireAnyPermission([...CLEAN_OR_MANAGE], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_sanitation_cleaning_tasks" })
  async createCleaningTask(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createCleaningTask(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("cleaning-tasks/:id/status")
  @RequireAnyPermission([...CLEAN], { requiresEntitlement: ENTITLEMENT })
  async updateCleaningTaskStatus(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.updateCleaningTaskStatus(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("cleaning-tasks/:id/complete")
  @RequireAnyPermission([...CLEAN], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_cleaning_complete" })
  async completeCleaning(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.completeCleaning(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  // ── Verifications ────────────────────────────────────────────────────────

  @Get("verifications")
  @RequireAnyPermission([...VERIFY], { requiresEntitlement: ENTITLEMENT })
  async listVerifications(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listVerifications(principal, query), getRequestIds(req));
  }

  @Post("verifications")
  @RequireAnyPermission([...VERIFY], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_verifications" })
  async createVerification(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createVerification(principal, body ?? {}), getRequestIds(req));
  }

  // ── Spills ───────────────────────────────────────────────────────────────

  @Get("spills")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listSpills(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listSpills(principal, query), getRequestIds(req));
  }

  @Post("spills")
  @RequireAnyPermission([...REPORT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_spills" })
  async reportSpill(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.reportSpill(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("spills/:id/status")
  @RequireAnyPermission([...CLEAN_OR_MANAGE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateSpillStatus(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.updateSpillStatus(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  // ── Pest ─────────────────────────────────────────────────────────────────

  @Get("pest-devices")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listPestDevices(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listPestDevices(principal, query), getRequestIds(req));
  }

  @Post("pest-devices")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_pest_devices" })
  async createPestDevice(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createPestDevice(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("pest-devices/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updatePestDevice(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.updatePestDevice(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("pest-devices/:id/qr")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async generatePestDeviceQr(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.generatePestDeviceQrToken(principal, id), getRequestIds(req));
  }

  @Get("pest-findings")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listPestFindings(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listPestFindings(principal, query), getRequestIds(req));
  }

  @Post("pest-findings")
  @RequireAnyPermission([...PEST_FINDING_CREATE], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_sanitation_pest_findings" })
  async createPestFinding(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createPestFinding(principal, body ?? {}), getRequestIds(req));
  }

  // ── Chemicals ────────────────────────────────────────────────────────────

  @Get("chemicals")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listChemicals(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listChemicals(principal, query), getRequestIds(req));
  }

  @Post("chemicals")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_chemicals" })
  async createChemical(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.createChemical(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("chemicals/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateChemical(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.updateChemical(principal, id, body ?? {}), getRequestIds(req));
  }

  // ── Environmental samples ────────────────────────────────────────────────

  @Get("environmental-samples")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listEnvironmentalSamples(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listEnvironmentalSamples(principal, query), getRequestIds(req));
  }

  @Post("environmental-samples")
  @RequireAnyPermission([...INSPECT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_env_samples" })
  async createEnvironmentalSample(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.createEnvironmentalSample(principal, body ?? {}),
      getRequestIds(req),
    );
  }

  @Patch("environmental-samples/:id")
  @RequireAnyPermission([...INSPECT], { requiresEntitlement: ENTITLEMENT })
  async updateEnvironmentalSample(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.updateEnvironmentalSample(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  // ── Compressed air ───────────────────────────────────────────────────────

  @Get("compressed-air-requests")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listCompressedAirRequests(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.listCompressedAirRequests(principal, query),
      getRequestIds(req),
    );
  }

  @Post("compressed-air-requests")
  @RequireAnyPermission([...COMPRESSED_AIR_CREATE], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_sanitation_compressed_air" })
  async createCompressedAirRequest(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.createCompressedAirRequest(principal, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("compressed-air-requests/:id/approve")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async approveCompressedAirRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.approveCompressedAirRequest(principal, id), getRequestIds(req));
  }

  @Post("compressed-air-requests/:id/deny")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async denyCompressedAirRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.denyCompressedAirRequest(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("compressed-air-requests/:id/complete")
  @RequireAnyPermission([...CLEAN_OR_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async completeCompressedAirRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.sanitation.completeCompressedAirRequest(principal, id),
      getRequestIds(req),
    );
  }

  @Post("compressed-air-requests/:id/verify")
  @RequireAnyPermission([...VERIFY], { requiresEntitlement: ENTITLEMENT })
  async verifyCompressedAirRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.verifyCompressedAirRequest(principal, id), getRequestIds(req));
  }

  // ── Concerns ─────────────────────────────────────────────────────────────

  @Get("concerns")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listConcerns(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.listConcerns(principal, query), getRequestIds(req));
  }

  @Post("concerns")
  @RequireAnyPermission([...REPORT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_sanitation_concerns" })
  async reportConcern(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.reportConcern(principal, body ?? {}), getRequestIds(req));
  }

  // ── UI settings (sub-module tab visibility) ──────────────────────────────

  @Get("ui-settings")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getUiSettings(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.sanitation.getUiSettings(principal), getRequestIds(req));
  }

  @Patch("ui-settings")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async updateUiSettings(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.sanitation.updateUiSettings(principal, body ?? {}), getRequestIds(req));
  }
}
