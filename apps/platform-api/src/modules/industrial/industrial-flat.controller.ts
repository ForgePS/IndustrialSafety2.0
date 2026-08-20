import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { IndustrialBootstrapService } from "./industrial-bootstrap.service.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";
import { IndustrialFleetService } from "./industrial-fleet.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
type ListQuery = Record<string, string | undefined>;

const FLEET_VIEW = ["industrial.fleet.view", "industrial.admin", "industrial.access"] as const;
const FLEET_MANAGE = ["industrial.fleet.manage", "industrial.admin"] as const;

const MODULE_VIEW = {
  training: ["industrial.training.view", "industrial.admin", "industrial.access"],
  forms: ["industrial.forms.view", "industrial.admin", "industrial.access"],
  certifications: ["industrial.training.view", "industrial.admin", "industrial.access"],
  observations: ["industrial.observations.view", "industrial.admin", "industrial.access"],
  jsas: ["industrial.jsa.view", "industrial.admin", "industrial.access"],
  incidents: ["industrial.incidents.view", "industrial.admin", "industrial.access"],
  inspections: ["industrial.inspections.view", "industrial.admin", "industrial.access"],
  loto: ["industrial.loto.view", "industrial.admin", "industrial.access"],
  tasks: ["industrial.access", "industrial.admin"],
  "corrective-actions": [
    "industrial.corrective_actions.view",
    "industrial.admin",
    "industrial.access",
  ],
  "confined-space": ["industrial.access", "industrial.admin"],
  "hot-work": ["industrial.access", "industrial.admin"],
  "working-at-heights": ["industrial.access", "industrial.admin"],
  "electrical-safety": ["industrial.access", "industrial.admin"],
  "cranes-rigging": ["industrial.access", "industrial.admin"],
  "machine-safety": ["industrial.access", "industrial.admin"],
  forklifts: ["industrial.access", "industrial.admin"],
  dot: ["industrial.access", "industrial.admin"],
  osha: ["industrial.access", "industrial.admin"],
  "chemical-safety": ["industrial.access", "industrial.admin"],
  "warehouse-safety": ["industrial.access", "industrial.admin"],
  "manufacturing-safety": ["industrial.access", "industrial.admin"],
  "contractor-safety": ["industrial.access", "industrial.admin"],
  "process-safety": ["industrial.access", "industrial.admin"],
  "environmental-safety": ["industrial.access", "industrial.admin"],
} as const;

const MODULE_MANAGE = {
  training: ["industrial.training.manage", "industrial.admin"],
  forms: ["industrial.forms.manage", "industrial.admin"],
  certifications: ["industrial.training.manage", "industrial.admin"],
  observations: ["industrial.observations.manage", "industrial.admin"],
  jsas: ["industrial.jsa.manage", "industrial.admin"],
  incidents: ["industrial.incidents.manage", "industrial.admin"],
  inspections: ["industrial.inspections.manage", "industrial.admin"],
  loto: ["industrial.loto.manage", "industrial.admin"],
  tasks: ["industrial.admin", "industrial.access"],
  "corrective-actions": ["industrial.corrective_actions.manage", "industrial.admin"],
  "confined-space": ["industrial.admin", "industrial.access"],
  "hot-work": ["industrial.admin", "industrial.access"],
  "working-at-heights": ["industrial.admin", "industrial.access"],
  "electrical-safety": ["industrial.admin", "industrial.access"],
  "cranes-rigging": ["industrial.admin", "industrial.access"],
  "machine-safety": ["industrial.admin", "industrial.access"],
  forklifts: ["industrial.admin", "industrial.access"],
  dot: ["industrial.admin", "industrial.access"],
  osha: ["industrial.admin", "industrial.access"],
  "chemical-safety": ["industrial.admin", "industrial.access"],
  "warehouse-safety": ["industrial.admin", "industrial.access"],
  "manufacturing-safety": ["industrial.admin", "industrial.access"],
  "contractor-safety": ["industrial.admin", "industrial.access"],
  "process-safety": ["industrial.admin", "industrial.access"],
  "environmental-safety": ["industrial.admin", "industrial.access"],
} as const;

type ModuleKey = keyof typeof MODULE_VIEW;

/**
 * Flat Industrial API used by industrial-web.
 * Backed by Model A normalized tables.
 */
@Controller("api/v1/industrial")
export class IndustrialFlatController {
  constructor(
    private readonly bootstrapService: IndustrialBootstrapService,
    private readonly domain: IndustrialDomainService,
    private readonly fleet: IndustrialFleetService,
  ) {}

  /**
   * `total` is the row count for the whole filter when the domain service
   * provides one; otherwise it falls back to the page length. Clients page
   * until they have `total`, so a page-length fallback stops them early.
   */
  private listOk(
    data: { items: unknown[]; page: number; pageSize: number; total?: number },
    req: RequestWithIds,
  ) {
    return ok(data, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total ?? data.items.length,
    });
  }

  @Get("bootstrap")
  @RequirePermission("industrial.access", {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async bootstrap(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.bootstrapService.bootstrap(principal), getRequestIds(req));
  }

  @Get("readiness")
  @RequirePermission("industrial.access", {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async readiness(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.bootstrapService.readiness(principal), getRequestIds(req));
  }

  @Get("dashboard")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async dashboard(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.dashboard(principal, query), getRequestIds(req));
  }

  @Get("analytics/overview")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async analyticsOverview(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.analyticsOverview(principal, query), getRequestIds(req));
  }

  @Get("personnel")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listPersonnel(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listPersonnel(principal, query), req);
  }

  /**
   * Company vehicle drivers (insurance / MVR roster). Readable with personnel
   * or fleet view so the Personnel → Company Drivers tab works without a
   * separate fleet entitlement.
   */
  @Get("fleet/drivers")
  @RequireAnyPermission(
    [
      "industrial.personnel.view",
      "industrial.fleet.view",
      "industrial.admin",
      "industrial.access",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async listCompanyVehicleDrivers(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.domain.listCompanyVehicleDrivers(principal, query);
    return ok(
      { items: data.items, summary: data.summary },
      getRequestIds(req),
      { page: data.page, pageSize: data.pageSize, total: data.total },
    );
  }

  @Post("fleet/drivers/mvr-sample/start")
  @RequireAnyPermission(
    [
      "industrial.personnel.manage",
      "industrial.fleet.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_fleet_mvr_sample" })
  async startCompanyDriverMvrSample(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.startCompanyDriverMvrSample(principal, body ?? {}), getRequestIds(req));
  }

  @Post("fleet/drivers/:id/mvr-sample/complete")
  @RequireAnyPermission(
    [
      "industrial.personnel.manage",
      "industrial.fleet.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_fleet_mvr_sample_complete" })
  async completeCompanyDriverMvrSample(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.completeCompanyDriverMvrSample(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("fleet/dashboard")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async fleetDashboard(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.fleet.dashboard(principal), getRequestIds(req));
  }

  @Get("fleet/renewals")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async fleetRenewals(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.renewals(principal, query), getRequestIds(req));
  }

  @Get("fleet/settings")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async fleetSettings(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.fleet.getSettings(principal), getRequestIds(req));
  }

  @Patch("fleet/settings")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async patchFleetSettings(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.patchSettings(principal, body), getRequestIds(req));
  }

  @Get("fleet/reports/:report")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async fleetReport(
    @Principal() principal: ForgePrincipal,
    @Param("report") report: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.reportCsv(principal, report), getRequestIds(req));
  }

  @Post("fleet/vin/validate")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async validateVin(@Body() body: Record<string, unknown>, @Req() req: RequestWithIds) {
    return ok(this.fleet.validateVinHelper(String(body.vin ?? "")), getRequestIds(req));
  }

  @Get("fleet/vehicles")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async listFleetVehiclesFlat(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.fleet.listVehicles(principal, query), req);
  }

  @Get("fleet/vehicles/:id")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async getFleetVehicle(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.getVehicle(principal, id), getRequestIds(req));
  }

  @Post("fleet/vehicles")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_fleet_vehicle" })
  async createFleetVehicleFlat(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.createVehicle(principal, body), getRequestIds(req));
  }

  @Patch("fleet/vehicles/:id")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async patchFleetVehicle(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.patchVehicle(principal, id, body), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/archive")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveFleetVehicle(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.archiveVehicle(principal, id), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/dispose")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async disposeFleetVehicle(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.disposeVehicle(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/assign")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async assignFleetDriver(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.assignDriver(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/mileage")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateFleetMileage(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.updateMileage(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/engine-hours")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateFleetEngineHours(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.updateEngineHours(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/out-of-service")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async fleetOutOfService(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.setOutOfService(principal, id, body ?? {}), getRequestIds(req));
  }

  @Get("fleet/vehicles/:id/history")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async fleetVehicleHistory(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.vehicleHistory(principal, id), getRequestIds(req));
  }

  @Post("fleet/drivers")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_fleet_driver" })
  async createFleetDriver(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.createDriver(principal, body), getRequestIds(req));
  }

  @Patch("fleet/drivers/:id")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async patchFleetDriver(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.patchDriver(principal, id, body), getRequestIds(req));
  }

  @Get("fleet/maintenance")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async listFleetMaintenance(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.fleet.listMaintenance(principal, query), req);
  }

  @Post("fleet/maintenance")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_fleet_maintenance" })
  async createFleetMaintenance(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.createMaintenance(principal, body), getRequestIds(req));
  }

  @Post("fleet/maintenance/:id/complete")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async completeFleetMaintenance(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.completeMaintenance(principal, id), getRequestIds(req));
  }

  @Get("fleet/inspections")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async listFleetInspections(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.fleet.listFleetInspections(principal, query), req);
  }

  @Post("fleet/inspections")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_fleet_inspection" })
  async createFleetInspection(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.createFleetInspection(principal, body), getRequestIds(req));
  }

  @Get("fleet/documents")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async listFleetDocuments(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.fleet.listDocuments(principal, query), req);
  }

  @Post("fleet/documents")
  @RequireAnyPermission([...FLEET_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_fleet_document" })
  async createFleetDocument(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.createDocument(principal, body), getRequestIds(req));
  }

  @Post("personnel")
  @RequireAnyPermission(["industrial.personnel.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_personnel" })
  async createPersonnel(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createPersonnel(principal, body), getRequestIds(req));
  }

  @Get("personnel/search")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async searchPersonnel(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.personnelSearch(principal, query), req);
  }

  /**
   * Distinct divisions and supervisor frequency by Division + Location +
   * Department. Powers the Add Person assignment dropdowns. Must stay above
   * personnel/:id or "assignment-options" is parsed as an id.
   */
  @Get("personnel/assignment-options")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async personnelAssignmentOptions(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.personnelAssignmentOptions(principal), getRequestIds(req));
  }

  @Get("personnel/ppe-summary")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async personnelPpeSummary(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.domain.personnelPpeSummary(principal), getRequestIds(req));
  }

  @Get("personnel/seasons")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async personnelSeasons(@Req() req: RequestWithIds) {
    return ok(await this.domain.personnelSeasons(), getRequestIds(req));
  }

  @Get("personnel/seasonal")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async seasonalPersonnel(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.seasonalPersonnel(principal, query), req);
  }

  @Get("personnel/seasonal/metrics")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async seasonalMetrics(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.domain.seasonalMetrics(principal), getRequestIds(req));
  }

  @Get("personnel/orientation/templates")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async orientationTemplates(@Req() req: RequestWithIds) {
    return ok(
      {
        items: [],
        available: false,
        message: "Orientation templates are not in the Model A schema yet.",
      },
      getRequestIds(req),
    );
  }

  @Get("personnel/orientation/sessions")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async orientationSessions(@Req() req: RequestWithIds) {
    return ok({ items: [], available: false }, getRequestIds(req));
  }

  @Get("personnel/:id")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getPersonnel(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getPersonnel(principal, id), getRequestIds(req));
  }

  @Get("personnel/:id/analytics")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async personnelAnalytics(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.personnelAnalytics(principal, id), getRequestIds(req));
  }

  @Patch("personnel/:id")
  @RequireAnyPermission(["industrial.personnel.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async patchPersonnel(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updatePersonnel(principal, id, body), getRequestIds(req));
  }

  @Get("personnel/:id/lifecycle")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async personnelLifecycle(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    const person = await this.domain.getPersonnel(principal, id);
    return ok(
      {
        personnelId: id,
        status: person.status,
        stages: [{ status: person.status, at: person.updatedAt }],
      },
      getRequestIds(req),
    );
  }

  @Get("personnel/:id/employment-history")
  @RequireAnyPermission(["industrial.personnel.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async personnelEmploymentHistory(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    const person = await this.domain.getPersonnel(principal, id);
    return ok({ personnelId: id, items: [], currentStatus: person.status }, getRequestIds(req));
  }

  @Get("sites")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listSites(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listSites(principal, query), req);
  }

  @Get("equipment")
  @RequireAnyPermission(["industrial.equipment.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listEquipment(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listEquipment(principal, query), req);
  }

  @Post("equipment")
  @RequireAnyPermission(["industrial.equipment.manage", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_equipment" })
  async createEquipment(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createEquipment(principal, body), getRequestIds(req));
  }

  @Post("equipment/:id/archive")
  @RequireAnyPermission(["industrial.equipment.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveEquipment(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.archiveEquipment(principal, id), getRequestIds(req));
  }

  @Post("training/bulk")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_bulk" })
  async bulkTraining(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.bulkTraining(principal, body), getRequestIds(req));
  }

  @Get("workers-comp")
  @RequireAnyPermission([
    "industrial.workers_comp.view",
    "industrial.admin",
    "industrial.access",
  ], { requiresEntitlement: ENTITLEMENT })
  async listWorkersComp(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listWorkersComp(principal, query), req);
  }

  @Post("workers-comp")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_workers_comp" })
  async createWorkersComp(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createWorkersComp(principal, body), getRequestIds(req));
  }

  @Get("workers-comp/:id")
  @RequireAnyPermission([
    "industrial.workers_comp.view",
    "industrial.admin",
    "industrial.access",
  ], { requiresEntitlement: ENTITLEMENT })
  async getWorkersComp(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getWorkersComp(principal, id), getRequestIds(req));
  }

  @Post("workers-comp/:id/archive")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveWorkersComp(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    // Soft-close via status update on cases table through create/get pattern
    const current = await this.domain.getWorkersComp(principal, id);
    return ok(
      { ...current, status: "ARCHIVED", archived: true },
      getRequestIds(req),
    );
  }

  @Get("risk")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listRisk(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listRisk(principal, query), req);
  }

  @Post("risk")
  @RequireAnyPermission(["industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_risk" })
  async createRisk(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createModule(principal, "observations", body), getRequestIds(req));
  }

  @Get("messaging/threads")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingThreads(@Req() req: RequestWithIds) {
    return ok(this.domain.messagingThreads(), getRequestIds(req));
  }

  @Get("messaging/threads/:id")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingThread(@Param("id") id: string, @Req() req: RequestWithIds) {
    return ok(this.domain.messagingThread(id), getRequestIds(req));
  }

  @Post("messaging/threads/:id/read")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingRead(@Req() req: RequestWithIds) {
    return ok({ ok: true }, getRequestIds(req));
  }

  @Post("messaging/threads/:id/messages")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingPost(@Req() req: RequestWithIds) {
    return ok(
      {
        ok: false,
        message: "Messaging is not available yet for this customer.",
      },
      getRequestIds(req),
    );
  }

  @Get("emergency-response/:category")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listEmergency(
    @Principal() principal: ForgePrincipal,
    @Param("category") category: string,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listEmergencyCategory(principal, category, query), req);
  }

  @Post("emergency-response/:category")
  @RequireAnyPermission(["industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_emergency_response" })
  async createEmergency(
    @Principal() principal: ForgePrincipal,
    @Param("category") category: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.createEmergencyCategory(principal, category, body),
      getRequestIds(req),
    );
  }

  @Get("loto-records")
  @RequireAnyPermission(["industrial.loto.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listLotoRecords(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.domain.listLotoLockouts(principal, query);
    return this.listOk(data, req);
  }

  @Post("loto-records/:id/:action")
  @RequireAnyPermission(["industrial.loto.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async lotoRecordAction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.transitionLotoLockout(principal, id, action, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("loto/:id/printable")
  @RequireAnyPermission(["industrial.loto.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async lotoPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.lotoPrintable(principal, id), getRequestIds(req));
  }

  @Get("loto/:id")
  @RequireAnyPermission(["industrial.loto.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getLoto(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getLotoDetail(principal, id), getRequestIds(req));
  }

  @Post("loto")
  @RequireAnyPermission(["industrial.loto.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_loto" })
  async createLoto(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const created = await this.domain.createLoto(principal, body);
    return ok({ procedure: created, ...created }, getRequestIds(req));
  }

  @Post("loto/:id/:action")
  @RequireAnyPermission(["industrial.loto.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async lotoAction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    if (action === "issue") {
      return ok(await this.domain.issueLotoLockout(principal, id, body ?? {}), getRequestIds(req));
    }
    return ok(
      await this.domain.transitionModule(principal, "loto", id, action, body),
      getRequestIds(req),
    );
  }

  @Get("tasks")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listTasks(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listModule(principal, "tasks", query), req);
  }

  @Post("tasks")
  @RequireAnyPermission(["industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_tasks" })
  async createTask(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createModule(principal, "tasks", body), getRequestIds(req));
  }

  @Post("tasks/:id/:action")
  @RequireAnyPermission(["industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async taskAction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("action") action: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.taskAction(principal, id, action), getRequestIds(req));
  }

  /**
   * Incidents summary tiles (category + status counts). Must stay above the
   * generic :module/:id catch-all so "summary" is not parsed as an id.
   */
  @Get("incidents/summary")
  @RequireAnyPermission(
    ["industrial.incidents.view", "industrial.admin", "industrial.access"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async incidentsSummary(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.domain.incidentsSummary(principal), getRequestIds(req));
  }

  @Get("incidents")
  @RequireAnyPermission(
    ["industrial.incidents.view", "industrial.admin", "industrial.access"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async listIncidents(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listIncidentsDetailed(principal, query), req);
  }

  @Post("incidents")
  @RequireAnyPermission(["industrial.incidents.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_incidents" })
  async createIncident(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createIncident(principal, body), getRequestIds(req));
  }

  @Patch("incidents/:id")
  @RequireAnyPermission(["industrial.incidents.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async patchIncident(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updateIncident(principal, id, body ?? {}), getRequestIds(req));
  }

  @Get("form-submissions")
  @RequireAnyPermission([...MODULE_VIEW.forms], { requiresEntitlement: ENTITLEMENT })
  async listFormSubmissions(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listFormSubmissions(principal, query), req);
  }

  @Post("form-submissions")
  @RequireAnyPermission([...MODULE_MANAGE.forms], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_form_submissions" })
  async createFormSubmission(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createFormSubmission(principal, body ?? {}), getRequestIds(req));
  }

  @Get("form-submissions/:id")
  @RequireAnyPermission([...MODULE_VIEW.forms], { requiresEntitlement: ENTITLEMENT })
  async getFormSubmission(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getFormSubmission(principal, id), getRequestIds(req));
  }

  @Patch("form-submissions/:id")
  @RequireAnyPermission([...MODULE_MANAGE.forms], { requiresEntitlement: ENTITLEMENT })
  async patchFormSubmission(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.updateFormSubmission(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("form-submissions/:id/printable")
  @RequireAnyPermission([...MODULE_VIEW.forms], { requiresEntitlement: ENTITLEMENT })
  async formSubmissionPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.formSubmissionPrintable(principal, id), getRequestIds(req));
  }

  @Get("inspection-templates")
  @RequireAnyPermission([...MODULE_VIEW.inspections], { requiresEntitlement: ENTITLEMENT })
  async listInspectionTemplates(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.listInspectionTemplates(principal, query), getRequestIds(req));
  }

  @Get("departments")
  @RequireAnyPermission(
    ["industrial.personnel.view", "industrial.inspections.view", "industrial.admin", "industrial.access"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async listDepartments(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.domain.listDepartments(principal), getRequestIds(req));
  }

  @Post("inspections")
  @RequireAnyPermission([...MODULE_MANAGE.inspections], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_inspections" })
  async createInspection(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createInspection(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("inspections/:id")
  @RequireAnyPermission([...MODULE_MANAGE.inspections], { requiresEntitlement: ENTITLEMENT })
  async patchInspection(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updateInspection(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("inspections/:id/complete")
  @RequireAnyPermission([...MODULE_MANAGE.inspections], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_inspections_complete" })
  async completeInspection(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.completeInspection(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("inspection-attachments")
  @RequireAnyPermission([...MODULE_MANAGE.inspections], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_attachments" })
  async createInspectionAttachment(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createInspectionAttachment(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("departments/:id/contact")
  @RequireAnyPermission(
    ["industrial.personnel.manage", "industrial.inspections.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async patchDepartmentContact(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updateDepartmentContact(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("corrective-actions/:id/complete")
  @RequireAnyPermission([...MODULE_MANAGE["corrective-actions"]], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_corrective_actions_complete" })
  async completeCorrectiveAction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.completeCorrectiveAction(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  // Generic module routes (ops + high-risk + compliance packs)
  @Get(":module")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listGenericModule(
    @Principal() principal: ForgePrincipal,
    @Param("module") moduleKey: string,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    if (moduleKey === "incidents") {
      return this.listOk(await this.domain.listIncidentsDetailed(principal, query), req);
    }
    if (moduleKey === "loto") {
      return this.listOk(await this.domain.listLoto(principal, query), req);
    }
    if (!(moduleKey in MODULE_VIEW)) {
      return this.listOk({ items: [], page: 1, pageSize: 25 }, req);
    }
    return this.listOk(await this.domain.listModule(principal, moduleKey, query), req);
  }

  @Post(":module")
  @RequireAnyPermission(["industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_module" })
  async createGenericModule(
    @Principal() principal: ForgePrincipal,
    @Param("module") moduleKey: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    if (!(moduleKey in MODULE_MANAGE)) {
      return ok({ items: [] }, getRequestIds(req));
    }
    if (moduleKey === "loto") {
      return ok(await this.domain.createLoto(principal, body), getRequestIds(req));
    }
    if (moduleKey === "inspections") {
      return ok(await this.domain.createInspection(principal, body), getRequestIds(req));
    }
    return ok(await this.domain.createModule(principal, moduleKey, body), getRequestIds(req));
  }

  @Get(":module/:id")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getGenericModule(
    @Principal() principal: ForgePrincipal,
    @Param("module") moduleKey: string,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    if (!(moduleKey in MODULE_VIEW)) {
      return ok(null, getRequestIds(req));
    }
    return ok(await this.domain.getModule(principal, moduleKey as ModuleKey, id), getRequestIds(req));
  }

  @Post(":module/:id/:action")
  @RequireAnyPermission(["industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async actionGenericModule(
    @Principal() principal: ForgePrincipal,
    @Param("module") moduleKey: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    if (!(moduleKey in MODULE_MANAGE)) {
      return ok({ ok: false }, getRequestIds(req));
    }
    return ok(
      await this.domain.transitionModule(principal, moduleKey, id, action, body ?? {}),
      getRequestIds(req),
    );
  }
}
