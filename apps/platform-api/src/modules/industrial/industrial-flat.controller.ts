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
import { ForgeError } from "@forge/errors";
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
import { IndustrialMessagingService } from "./industrial-messaging.service.js";
import { IndustrialSafetySuppliesService } from "./industrial-safety-supplies.service.js";
import { IndustrialSupplyRequestQrService } from "./industrial-supply-request-qr.service.js";
import { IndustrialDotDqfDocumentsService } from "./industrial-dot-dqf-documents.service.js";
import { IndustrialMvrConsentDocumentsService } from "./industrial-mvr-consent-documents.service.js";
import { IndustrialPersonnelCertificationsService } from "./industrial-personnel-certifications.service.js";
import { IndustrialPersonnelLicenseDocumentsService } from "./industrial-personnel-license-documents.service.js";
import { IndustrialIncidentAttachmentsService } from "./industrial-incident-attachments.service.js";
import { IndustrialMyWorkService } from "./industrial-my-work.service.js";
import { IndustrialSettingsModulesService } from "./industrial-settings-modules.service.js";
import { IndustrialPhotoMarkupSettingsService } from "./industrial-photo-markup-settings.service.js";
import { IndustrialTasksExtrasService } from "./industrial-tasks-extras.service.js";
import { IndustrialPersonnelDisciplineAttachmentsService } from "./industrial-personnel-discipline-attachments.service.js";
import { IndustrialPerformanceReportService } from "./industrial-performance-report.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
type ListQuery = Record<string, string | undefined>;

const FLEET_VIEW = [
  "industrial.fleet.view",
  "industrial.admin",
  "industrial.access",
  "field.fleet.inspect",
  "field.access",
] as const;
const FLEET_MANAGE = [
  "industrial.fleet.manage",
  "industrial.admin",
  "industrial.access",
  "field.fleet.inspect",
  "field.access",
] as const;
const SUPPLIES_VIEW = [
  "industrial.supplies.view",
  "industrial.supplies.manage",
  "industrial.admin",
  "industrial.access",
  "field.access",
] as const;
const SUPPLIES_MANAGE = [
  "industrial.supplies.manage",
  "industrial.supplies.create",
  "industrial.supplies.edit",
  "industrial.supplies.settings.manage",
  "industrial.admin",
] as const;
const SUPPLIES_ISSUE = [
  "industrial.supplies.issue",
  "industrial.supplies.ppe.issue",
  "industrial.supplies.manage",
  "industrial.admin",
  "industrial.access",
  "field.access",
] as const;
const SUPPLIES_RECEIVE = [
  "industrial.supplies.receive",
  "industrial.supplies.manage",
  "industrial.admin",
] as const;
const SUPPLIES_TRANSFER = [
  "industrial.supplies.transfer",
  "industrial.supplies.manage",
  "industrial.admin",
] as const;
const SUPPLIES_ADJUST = [
  "industrial.supplies.adjust",
  "industrial.supplies.manage",
  "industrial.admin",
] as const;
const SUPPLIES_PURCHASE = [
  "industrial.supplies.purchase.view",
  "industrial.supplies.purchase.create",
  "industrial.supplies.purchase.approve",
  "industrial.supplies.vendor.manage",
  "industrial.supplies.manage",
  "industrial.admin",
] as const;
const FORM_SUBMIT = [
  "industrial.forms.manage",
  "industrial.forms.view",
  "industrial.personnel.manage",
  "industrial.fleet.manage",
  "industrial.admin",
  "industrial.access",
  "field.access",
] as const;
const LOTO_VIEW = [
  "industrial.loto.view",
  "industrial.admin",
  "industrial.access",
  "field.loto.execute",
  "field.access",
] as const;
const LOTO_EXECUTE = [
  "industrial.loto.manage",
  "industrial.admin",
  "field.loto.execute",
  "field.access",
] as const;
const LOTO_MANAGE = ["industrial.loto.manage", "industrial.admin"] as const;
const LOTO_APPROVE = [
  "industrial.loto.approve",
  "industrial.loto.manage",
  "industrial.admin",
] as const;
const LOTO_AUTHOR = [
  "industrial.loto.manage",
  "industrial.loto.create",
  "industrial.loto.edit",
  "industrial.admin",
  "field.loto.execute",
  "field.access",
] as const;
const LOTO_TRANSITION = [...new Set([...LOTO_AUTHOR, ...LOTO_APPROVE])] as const;

const MODULE_VIEW = {
  training: ["industrial.training.view", "industrial.admin", "industrial.access"],
  forms: ["industrial.forms.view", "industrial.admin", "industrial.access"],
  certifications: ["industrial.training.view", "industrial.admin", "industrial.access"],
  observations: ["industrial.observations.view", "industrial.admin", "industrial.access"],
  jsas: ["industrial.jsa.view", "industrial.admin", "industrial.access"],
  incidents: ["industrial.incidents.view", "industrial.admin", "industrial.access"],
  inspections: [
    "industrial.inspections.view",
    "industrial.admin",
    "industrial.access",
    "field.inspections.perform",
    "field.access",
  ],
  loto: [
    "industrial.loto.view",
    "industrial.admin",
    "industrial.access",
    "field.loto.execute",
    "field.access",
  ],
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
  forklifts: ["industrial.access", "industrial.admin", "field.fleet.inspect", "field.access"],
  dot: [
    "industrial.access",
    "industrial.admin",
    "industrial.dot.view",
    "industrial.dot.manage",
    "field.fleet.inspect",
    "field.access",
  ],
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
  observations: [
    "industrial.observations.manage",
    "industrial.observations.view",
    "industrial.admin",
    "industrial.access",
    "field.observations.create",
    "field.hazards.create",
    "field.access",
  ],
  jsas: [
    "industrial.jsa.manage",
    "industrial.admin",
    "industrial.access",
    "field.jsa.execute",
    "field.access",
  ],
  incidents: [
    "industrial.incidents.manage",
    "industrial.incidents.view",
    "industrial.admin",
    "industrial.access",
    "field.incidents.create",
    "field.access",
  ],
  inspections: [
    "industrial.inspections.manage",
    "industrial.admin",
    "field.inspections.perform",
    "field.access",
  ],
  loto: ["industrial.loto.manage", "industrial.admin"],
  tasks: ["industrial.admin", "industrial.access"],
  "corrective-actions": [
    "industrial.corrective_actions.manage",
    "industrial.corrective_actions.view",
    "industrial.admin",
    "industrial.access",
    "field.hazards.create",
    "field.access",
  ],
  "confined-space": [
    "industrial.admin",
    "industrial.access",
    "field.permits.view",
    "field.permits.approve",
    "field.access",
  ],
  "hot-work": [
    "industrial.admin",
    "industrial.access",
    "field.permits.view",
    "field.permits.approve",
    "field.access",
  ],
  "working-at-heights": [
    "industrial.admin",
    "industrial.access",
    "field.permits.view",
    "field.permits.approve",
    "field.access",
  ],
  "electrical-safety": [
    "industrial.admin",
    "industrial.access",
    "field.permits.view",
    "field.permits.approve",
    "field.access",
  ],
  "cranes-rigging": ["industrial.admin", "industrial.access"],
  "machine-safety": ["industrial.admin", "industrial.access"],
  forklifts: ["industrial.admin", "industrial.access", "field.fleet.inspect", "field.access"],
  dot: [
    "industrial.admin",
    "industrial.access",
    "industrial.dot.manage",
    "industrial.dot.view",
    "field.fleet.inspect",
    "field.access",
  ],
  osha: ["industrial.admin", "industrial.access"],
  "chemical-safety": ["industrial.admin", "industrial.access", "field.sds.view", "field.access"],
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
    private readonly messaging: IndustrialMessagingService,
    private readonly supplies: IndustrialSafetySuppliesService,
    private readonly supplyQr: IndustrialSupplyRequestQrService,
    private readonly personnelCerts: IndustrialPersonnelCertificationsService,
    private readonly personnelLicenses: IndustrialPersonnelLicenseDocumentsService,
    private readonly mvrConsentDocuments: IndustrialMvrConsentDocumentsService,
    private readonly dotDqfDocuments: IndustrialDotDqfDocumentsService,
    private readonly incidentAttachments: IndustrialIncidentAttachmentsService,
    private readonly settingsModules: IndustrialSettingsModulesService,
    private readonly photoMarkupSettings: IndustrialPhotoMarkupSettingsService,
    private readonly myWork: IndustrialMyWorkService,
    private readonly taskExtras: IndustrialTasksExtrasService,
    private readonly disciplineAttachments: IndustrialPersonnelDisciplineAttachmentsService,
    private readonly performanceReport: IndustrialPerformanceReportService,
  ) {}

  /**
   * `total` is the row count for the whole filter when the domain service
   * provides one; otherwise it falls back to the page length. Clients page
   * until they have `total`, so a page-length fallback stops them early.
   */
  private listOk(
    data: {
      items: unknown[];
      page: number;
      pageSize: number;
      total?: number;
      summary?: unknown;
      [key: string]: unknown;
    },
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

  @Get("settings/modules")
  @RequirePermission("industrial.admin", {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async listCompanyModules(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.settingsModules.listCompanyModules(principal), getRequestIds(req));
  }

  @Put("settings/modules/:moduleCode")
  @RequirePermission("industrial.admin", {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  @Idempotent({ resourceType: "industrial_company_module" })
  async setCompanyModule(
    @Principal() principal: ForgePrincipal,
    @Param("moduleCode") moduleCode: string,
    @Body() body: { enabled?: boolean },
    @Req() req: RequestWithIds,
  ) {
    const enabled = body?.enabled === true;
    return ok(
      await this.settingsModules.setModuleEnabled(principal, moduleCode, enabled),
      getRequestIds(req),
    );
  }

  @Get("settings/photo-markup")
  @RequireAnyPermission(["industrial.admin", "industrial.photo_markup.view", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async getPhotoMarkupSettings(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.photoMarkupSettings.get(principal), getRequestIds(req));
  }

  @Put("settings/photo-markup")
  @RequirePermission("industrial.admin", {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  @Idempotent({ resourceType: "industrial_photo_markup_settings" })
  async updatePhotoMarkupSettings(
    @Principal() principal: ForgePrincipal,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.photoMarkupSettings.update(principal, body), getRequestIds(req));
  }

  @Get("my-notifications")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async myNotifications(
    @Principal() principal: ForgePrincipal,
    @Query("limit") limitRaw: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const limit = limitRaw ? Number(limitRaw) : 20;
    const items = await this.domain.listMyNotifications(principal, limit);
    return ok(items, getRequestIds(req), { page: 1, pageSize: items.length, total: items.length });
  }

  @Get("my-work")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async myWorkInbox(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const data = await this.myWork.listMyWork(principal);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.items.length,
      total: data.items.length,
    });
  }

  @Get("my-notifications/unread-count")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async myNotificationUnreadCount(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.myNotificationUnreadCount(principal), getRequestIds(req));
  }

  @Post("my-notifications/read-all")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async markAllMyNotificationsRead(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.markAllMyNotificationsRead(principal), getRequestIds(req));
  }

  @Post("my-notifications/:id/read")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
    allowWhenSuspended: true,
  })
  async markMyNotificationRead(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.markMyNotificationRead(principal, id), getRequestIds(req));
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

  @Get("analytics/injury-history")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async injuryHistory(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.injuryHistory(principal, query), getRequestIds(req));
  }

  @Post("analytics/performance-report")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async performanceReportGenerate(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.performanceReport.generate(principal, body ?? {}), getRequestIds(req));
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
    ["industrial.personnel.view", "industrial.fleet.view", "industrial.admin", "industrial.access"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async listCompanyVehicleDrivers(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.domain.listCompanyVehicleDrivers(principal, query);
    return ok({ items: data.items, summary: data.summary }, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Post("fleet/drivers/mvr-sample/start")
  @RequireAnyPermission(
    ["industrial.personnel.manage", "industrial.fleet.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_fleet_mvr_sample" })
  async startCompanyDriverMvrSample(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.startCompanyDriverMvrSample(principal, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("fleet/drivers/:id/mvr-sample/complete")
  @RequireAnyPermission(
    ["industrial.personnel.manage", "industrial.fleet.manage", "industrial.admin"],
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
  @RequireAnyPermission([...FLEET_VIEW, "industrial.dot.view", "industrial.dot.manage"], {
    requiresEntitlement: ENTITLEMENT,
  })
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

  @Get("fleet/vehicles/:id/dvirs")
  @RequireAnyPermission(
    [...FLEET_VIEW, "industrial.dot.view", "industrial.dot.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async listFleetVehicleDvirs(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listDvirsForVehicle(principal, id, query), req);
  }

  @Get("fleet/vehicles/:id/dvirs/day/:date/printable")
  @RequireAnyPermission(
    [...FLEET_VIEW, "industrial.dot.view", "industrial.dot.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async fleetDvirDayPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("date") date: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.dvirDayPrintable(principal, id, date), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/dvir-qr")
  @RequireAnyPermission([...FLEET_MANAGE, "industrial.dot.manage"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_fleet_dvir_qr" })
  async issueFleetDvirQr(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.issueDvirQr(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/dvir-qr/ensure")
  @RequireAnyPermission(
    [...FLEET_MANAGE, "industrial.dot.manage", "industrial.fleet.view", "industrial.printer.print"],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
  async ensureFleetDvirQr(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.ensureDvirQr(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/dvir-qr/image")
  @RequireAnyPermission([...FLEET_MANAGE, "industrial.dot.manage"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async fleetDvirQrImage(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.dvirQrImage(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("fleet/vehicles/:id/dvir-qr/revoke")
  @RequireAnyPermission([...FLEET_MANAGE, "industrial.dot.manage"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async revokeFleetDvirQr(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.revokeDvirQr(principal, id), getRequestIds(req));
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

  @Post("fleet/drivers/:id/merge-personnel")
  @RequireAnyPermission(
    ["industrial.fleet.manage", "industrial.personnel.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async mergeFleetDriverToPersonnel(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.mergeDriverToPersonnel(principal, id, body), getRequestIds(req));
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

  @Get("fleet/documents/:id")
  @RequireAnyPermission([...FLEET_VIEW], { requiresEntitlement: ENTITLEMENT })
  async getFleetDocument(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.fleet.getDocument(principal, id), getRequestIds(req));
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

  @Get("personnel/first-aid-summary")
  @RequireAnyPermission(
    [
      "industrial.first_aid.view",
      "industrial.personnel.view",
      "industrial.admin",
      "industrial.access",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async personnelFirstAidSummary(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.personnelFirstAidSummary(principal), getRequestIds(req));
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

  @Post("personnel/certifications/upload-url")
  @RequireAnyPermission(
    ["industrial.personnel.manage", "industrial.first_aid.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_personnel_cert_upload" })
  async personnelCertUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.personnelCerts.createUploadUrl(principal, body), getRequestIds(req));
  }

  @Post("personnel/certifications/complete")
  @RequireAnyPermission(
    ["industrial.personnel.manage", "industrial.first_aid.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_personnel_cert_complete" })
  async personnelCertComplete(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.personnelCerts.completeUpload(principal, body), getRequestIds(req));
  }

  @Post("personnel/license/upload-url")
  @RequireAnyPermission(
    [
      "industrial.personnel.manage",
      "industrial.fleet.manage",
      "industrial.dot.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_personnel_license_upload" })
  async personnelLicenseUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.personnelLicenses.createUploadUrl(principal, body), getRequestIds(req));
  }

  @Post("personnel/license/complete")
  @RequireAnyPermission(
    [
      "industrial.personnel.manage",
      "industrial.fleet.manage",
      "industrial.dot.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_personnel_license_complete" })
  async personnelLicenseComplete(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.personnelLicenses.completeUpload(principal, body), getRequestIds(req));
  }

  @Get("personnel/license/:documentId/download-url")
  @RequireAnyPermission(
    [
      "industrial.personnel.view",
      "industrial.personnel.manage",
      "industrial.fleet.view",
      "industrial.dot.view",
      "industrial.admin",
      "industrial.access",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async personnelLicenseDownloadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.personnelLicenses.createDownloadUrl(principal, documentId),
      getRequestIds(req),
    );
  }

  @Post("personnel/mvr-consent/upload-url")
  @RequireAnyPermission(
    [
      "industrial.personnel.manage",
      "industrial.fleet.manage",
      "industrial.dot.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_mvr_consent_upload" })
  async personnelMvrConsentUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.mvrConsentDocuments.createUploadUrl(principal, { ...body, kind: "consent" }),
      getRequestIds(req),
    );
  }

  @Post("personnel/mvr-consent/complete")
  @RequireAnyPermission(
    [
      "industrial.personnel.manage",
      "industrial.fleet.manage",
      "industrial.dot.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_mvr_consent_complete" })
  async personnelMvrConsentComplete(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.mvrConsentDocuments.completeUpload(principal, { ...body, kind: "consent" }),
      getRequestIds(req),
    );
  }

  @Post("personnel/mvr-report/upload-url")
  @RequireAnyPermission(
    [
      "industrial.personnel.manage",
      "industrial.fleet.manage",
      "industrial.dot.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_mvr_report_upload" })
  async personnelMvrReportUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.mvrConsentDocuments.createUploadUrl(principal, { ...body, kind: "report" }),
      getRequestIds(req),
    );
  }

  @Post("personnel/mvr-report/complete")
  @RequireAnyPermission(
    [
      "industrial.personnel.manage",
      "industrial.fleet.manage",
      "industrial.dot.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_mvr_report_complete" })
  async personnelMvrReportComplete(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.mvrConsentDocuments.completeUpload(principal, { ...body, kind: "report" }),
      getRequestIds(req),
    );
  }

  @Get("personnel/mvr-documents/:documentId/download-url")
  @RequireAnyPermission(
    [
      "industrial.personnel.view",
      "industrial.personnel.manage",
      "industrial.fleet.view",
      "industrial.fleet.manage",
      "industrial.dot.view",
      "industrial.admin",
      "industrial.access",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async personnelMvrDocumentDownloadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.mvrConsentDocuments.createDownloadUrl(principal, documentId),
      getRequestIds(req),
    );
  }

  @Post("personnel/certifications/assign")
  @RequireAnyPermission(
    ["industrial.personnel.manage", "industrial.first_aid.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_personnel_cert_assign" })
  async personnelCertAssign(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.personnelCerts.assignToPersonnel(principal, body), getRequestIds(req));
  }

  @Get("personnel/:id/certifications/:kind/download-url")
  @RequireAnyPermission(
    [
      "industrial.personnel.view",
      "industrial.first_aid.view",
      "industrial.admin",
      "industrial.access",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async personnelCertDownloadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("kind") kind: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.personnelCerts.createDownloadUrl(principal, id, kind), getRequestIds(req));
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

  @Get("personnel/:id/disciplinary-actions")
  @RequireAnyPermission(
    [
      "industrial.personnel.discipline.view",
      "industrial.personnel.discipline.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async listPersonnelDisciplinaryActions(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.listPersonnelDisciplinaryActions(principal, id),
      getRequestIds(req),
    );
  }

  @Post("personnel/:id/disciplinary-actions")
  @RequireAnyPermission(["industrial.personnel.discipline.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createPersonnelDisciplinaryAction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.createPersonnelDisciplinaryAction(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Patch("personnel/:id/disciplinary-actions/:actionId")
  @RequireAnyPermission(["industrial.personnel.discipline.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updatePersonnelDisciplinaryAction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("actionId") actionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.updatePersonnelDisciplinaryAction(principal, id, actionId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("personnel/:id/disciplinary-actions/:actionId/rescind")
  @RequireAnyPermission(["industrial.personnel.discipline.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async rescindPersonnelDisciplinaryAction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("actionId") actionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.rescindPersonnelDisciplinaryAction(principal, id, actionId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("personnel/:id/disciplinary-actions/:actionId/attachments/upload-url")
  @RequireAnyPermission(["industrial.personnel.discipline.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_personnel_discipline_attachment" })
  async createDisciplineAttachmentUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("actionId") actionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.disciplineAttachments.createUploadUrl(principal, id, actionId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("personnel/:id/disciplinary-actions/:actionId/attachments/complete")
  @RequireAnyPermission(["industrial.personnel.discipline.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_personnel_discipline_attachment_complete" })
  async completeDisciplineAttachmentUpload(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("actionId") actionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.disciplineAttachments.completeUpload(principal, id, actionId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("personnel/:id/disciplinary-actions/:actionId/attachments/:documentId/download-url")
  @RequireAnyPermission(
    [
      "industrial.personnel.discipline.view",
      "industrial.personnel.discipline.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async disciplineAttachmentDownloadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("actionId") actionId: string,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.disciplineAttachments.createDownloadUrl(principal, id, actionId, documentId),
      getRequestIds(req),
    );
  }

  @Delete("personnel/:id/disciplinary-actions/:actionId/attachments/:documentId")
  @RequireAnyPermission(["industrial.personnel.discipline.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async deleteDisciplineAttachment(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("actionId") actionId: string,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.disciplineAttachments.deleteAttachment(principal, id, actionId, documentId),
      getRequestIds(req),
    );
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

  @Post("personnel/:id/sms-authorization")
  @RequireAnyPermission(["industrial.personnel.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async authorizePersonnelSms(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.authorizePersonnelSms(principal, id), getRequestIds(req));
  }

  @Get("personnel/:id/sms-consents")
  @RequireAnyPermission(
    ["industrial.personnel.view", "industrial.personnel.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async listPersonnelSmsConsents(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.listPersonnelSmsConsents(principal, id), getRequestIds(req));
  }

  @Post("personnel/:id/sms-authorization/revoke")
  @RequireAnyPermission(["industrial.personnel.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async revokePersonnelSmsAuthorization(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.revokePersonnelSmsAuthorization(principal, id), getRequestIds(req));
  }

  @Post("personnel/:id/archive")
  @RequireAnyPermission(["industrial.personnel.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archivePersonnel(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.archivePersonnel(principal, id), getRequestIds(req));
  }

  @Post("personnel/:id/unarchive")
  @RequireAnyPermission(["industrial.personnel.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async unarchivePersonnel(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.unarchivePersonnel(principal, id), getRequestIds(req));
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
  @RequireAnyPermission(
    [
      "industrial.equipment.view",
      "industrial.admin",
      "industrial.access",
      "field.access",
      "field.fleet.inspect",
    ],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
  async listEquipment(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listEquipment(principal, query), req);
  }

  @Get("equipment/:id")
  @RequireAnyPermission(
    [
      "industrial.equipment.view",
      "industrial.admin",
      "industrial.access",
      "field.access",
      "field.fleet.inspect",
    ],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
  async getEquipment(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getEquipment(principal, id), getRequestIds(req));
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
  @RequireAnyPermission(["industrial.workers_comp.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
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

  @Get("workers-comp/carriers")
  @RequireAnyPermission(["industrial.workers_comp.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listWorkersCompCarriers(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.listWorkersCompCarriers(principal), getRequestIds(req));
  }

  @Get("workers-comp/settings")
  @RequireAnyPermission(["industrial.workers_comp.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getWorkersCompSettings(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.domain.getWorkersCompSettings(principal), getRequestIds(req));
  }

  @Patch("workers-comp/settings")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async patchWorkersCompSettings(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.patchWorkersCompSettings(principal, body), getRequestIds(req));
  }

  @Get("workers-comp/weekly-status/preview")
  @RequireAnyPermission(["industrial.workers_comp.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async previewWorkersCompWeeklyStatus(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.previewWorkersCompWeeklyStatus(principal), getRequestIds(req));
  }

  @Post("workers-comp/weekly-status/send")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_workers_comp_weekly_status" })
  async sendWorkersCompWeeklyStatus(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.sendWorkersCompWeeklyStatus(principal, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("workers-comp/weekly-updates")
  @RequireAnyPermission(["industrial.workers_comp.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listWorkersCompWeeklyUpdates(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.listWorkersCompWeeklyUpdates(principal, query), getRequestIds(req));
  }

  @Put("workers-comp/:id/weekly-updates")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async upsertWorkersCompWeeklyUpdate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.upsertWorkersCompWeeklyUpdate(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("workers-comp/carriers")
  @RequirePermission("industrial.admin", {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_workers_comp_carrier" })
  async createWorkersCompCarrier(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createWorkersCompCarrier(principal, body), getRequestIds(req));
  }

  @Patch("workers-comp/carriers/:carrierId")
  @RequirePermission("industrial.admin", {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateWorkersCompCarrier(
    @Principal() principal: ForgePrincipal,
    @Param("carrierId") carrierId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.updateWorkersCompCarrier(principal, carrierId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("workers-comp/carriers/:carrierId/archive")
  @RequirePermission("industrial.admin", {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveWorkersCompCarrier(
    @Principal() principal: ForgePrincipal,
    @Param("carrierId") carrierId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.archiveWorkersCompCarrier(principal, carrierId),
      getRequestIds(req),
    );
  }

  @Get("workers-comp/:id")
  @RequireAnyPermission(["industrial.workers_comp.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getWorkersComp(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getWorkersComp(principal, id), getRequestIds(req));
  }

  @Get("workers-comp/:id/printable")
  @RequireAnyPermission(["industrial.workers_comp.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async workersCompPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.workersCompPrintable(principal, id), getRequestIds(req));
  }

  @Patch("workers-comp/:id")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateWorkersComp(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updateWorkersComp(principal, id, body ?? {}), getRequestIds(req));
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
    return ok(await this.domain.archiveWorkersComp(principal, id), getRequestIds(req));
  }

  @Post("workers-comp/:id/work-status")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_workers_comp_work_status" })
  async createWorkersCompWorkStatus(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.createWorkersCompWorkStatus(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Patch("workers-comp/:id/work-status/:periodId")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateWorkersCompWorkStatus(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("periodId") periodId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.updateWorkersCompWorkStatus(principal, id, periodId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Delete("workers-comp/:id/work-status/:periodId")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveWorkersCompWorkStatus(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("periodId") periodId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.archiveWorkersCompWorkStatus(principal, id, periodId),
      getRequestIds(req),
    );
  }

  @Post("workers-comp/:id/restrictions")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_workers_comp_restriction" })
  async createWorkersCompRestriction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.createWorkersCompRestriction(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Patch("workers-comp/:id/restrictions/:restrictionId")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateWorkersCompRestriction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("restrictionId") restrictionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.updateWorkersCompRestriction(principal, id, restrictionId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Delete("workers-comp/:id/restrictions/:restrictionId")
  @RequireAnyPermission(["industrial.workers_comp.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveWorkersCompRestriction(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("restrictionId") restrictionId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.archiveWorkersCompRestriction(principal, id, restrictionId),
      getRequestIds(req),
    );
  }

  @Get("workers-comp/:id/medical")
  @RequireAnyPermission(
    [
      "industrial.workers_comp.medical.view",
      "industrial.workers_comp.medical.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async listWorkersCompMedical(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.listWorkersCompMedical(principal, id), getRequestIds(req));
  }

  @Post("workers-comp/:id/medical")
  @RequireAnyPermission(["industrial.workers_comp.medical.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_workers_comp_medical" })
  async createWorkersCompMedical(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.createWorkersCompMedical(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Patch("workers-comp/:id/medical/:encounterId")
  @RequireAnyPermission(
    [
      "industrial.workers_comp.medical.manage",
      "industrial.workers_comp.medical.view",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async updateWorkersCompMedical(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("encounterId") encounterId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.updateWorkersCompMedical(principal, id, encounterId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("observations/settings")
  @RequireAnyPermission(["industrial.observations.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getObservationsSettings(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getObservationsSettings(principal), getRequestIds(req));
  }

  @Patch("observations/settings")
  @RequireAnyPermission(["industrial.observations.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async patchObservationsSettings(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.patchObservationsSettings(principal, body ?? {}),
      getRequestIds(req),
    );
  }

  @Patch("observations/:id")
  @RequireAnyPermission(["industrial.observations.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateObservation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updateObservation(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("observations/:id/email")
  @RequireAnyPermission(["industrial.observations.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async emailObservation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.emailObservation(principal, id, body ?? {}), getRequestIds(req));
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

  @Get("messaging/participants")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingParticipants(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.messaging.listParticipants(principal), getRequestIds(req));
  }

  @Get("supplies/dashboard")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesDashboard(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.supplies.dashboard(principal), getRequestIds(req));
  }

  @Get("supplies/settings")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesSettings(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.supplies.getSettings(principal), getRequestIds(req));
  }

  @Patch("supplies/settings")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async patchSuppliesSettings(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.patchSettings(principal, body), getRequestIds(req));
  }

  @Get("supplies/categories")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesCategories(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.supplies.listCategories(principal), getRequestIds(req));
  }

  @Post("supplies/categories")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_category" })
  async createSuppliesCategory(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createCategory(principal, body), getRequestIds(req));
  }

  @Get("supplies/audit")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesAudit(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listAudit(principal, query), getRequestIds(req));
  }

  @Get("supplies/items")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesItems(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listItems(principal, query), getRequestIds(req));
  }

  @Post("supplies/items")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_item" })
  async createSuppliesItem(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createItem(principal, body), getRequestIds(req));
  }

  @Get("supplies/items/:id")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async getSuppliesItem(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.getItem(principal, id), getRequestIds(req));
  }

  @Patch("supplies/items/:id")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async patchSuppliesItem(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.updateItem(principal, id, body), getRequestIds(req));
  }

  /** Soft-delete. Service enforces Tenant Admin or Creator only. */
  @Post("supplies/items/:id/archive")
  @RequireAnyPermission(["industrial.supplies.delete", ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveSuppliesItem(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.archiveItem(principal, id), getRequestIds(req));
  }

  @Get("supplies/items/:id/variants")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesItemVariants(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listVariants(principal, id), getRequestIds(req));
  }

  @Post("supplies/items/:id/variants")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_item_variant" })
  async createSuppliesVariant(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createVariant(principal, id, body), getRequestIds(req));
  }

  @Get("supplies/locations")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesLocations(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listLocations(principal, query), getRequestIds(req));
  }

  @Post("supplies/locations")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_location" })
  async createSuppliesLocation(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createLocation(principal, body), getRequestIds(req));
  }

  /** Service enforces Tenant Admin or Creator only. */
  @Patch("supplies/locations/:id")
  @RequireAnyPermission(["industrial.supplies.manage", "industrial.admin", ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async patchSuppliesLocation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.updateLocation(principal, id, body), getRequestIds(req));
  }

  /** Soft-delete. Service enforces Tenant Admin or Creator only. */
  @Post("supplies/locations/:id/archive")
  @RequireAnyPermission(["industrial.supplies.delete", "industrial.admin", ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveSuppliesLocation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.archiveLocation(principal, id), getRequestIds(req));
  }

  @Get("supplies/inventory")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesInventory(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listInventory(principal, query), getRequestIds(req));
  }

  @Post("supplies/receive")
  @RequireAnyPermission([...SUPPLIES_RECEIVE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_receipt" })
  async suppliesReceive(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.receive(principal, body), getRequestIds(req));
  }

  @Post("supplies/issue")
  @RequireAnyPermission([...SUPPLIES_ISSUE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_issue" })
  async suppliesIssue(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.issue(principal, body), getRequestIds(req));
  }

  @Post("supplies/return")
  @RequireAnyPermission([...SUPPLIES_ISSUE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_return" })
  async suppliesReturn(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.returnSupply(principal, body), getRequestIds(req));
  }

  @Post("supplies/transfer")
  @RequireAnyPermission([...SUPPLIES_TRANSFER], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_transfer" })
  async suppliesTransfer(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.transfer(principal, body), getRequestIds(req));
  }

  @Post("supplies/adjust")
  @RequireAnyPermission([...SUPPLIES_ADJUST], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_adjustment" })
  async suppliesAdjust(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.adjust(principal, body), getRequestIds(req));
  }

  @Get("supplies/ppe")
  @RequireAnyPermission(
    [
      "industrial.supplies.ppe.view",
      "industrial.supplies.view",
      "industrial.supplies.manage",
      "industrial.admin",
      "industrial.access",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async suppliesPpe(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listAssignments(principal, query), getRequestIds(req));
  }

  @Post("supplies/ppe/issue")
  @RequireAnyPermission([...SUPPLIES_ISSUE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_ppe_issue" })
  async suppliesPpeIssue(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.issuePpe(principal, body), getRequestIds(req));
  }

  @Post("supplies/ppe/:id/return")
  @RequireAnyPermission(
    [
      "industrial.supplies.ppe.return",
      "industrial.supplies.return",
      "industrial.supplies.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_supply_ppe_return" })
  async suppliesPpeReturn(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.returnPpe(principal, id, body), getRequestIds(req));
  }

  @Get("supplies/counts")
  @RequireAnyPermission(
    [
      "industrial.supplies.count",
      "industrial.supplies.view",
      "industrial.supplies.manage",
      "industrial.admin",
      "industrial.access",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async suppliesCounts(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listCounts(principal, query), getRequestIds(req));
  }

  @Post("supplies/counts")
  @RequireAnyPermission(
    ["industrial.supplies.count", "industrial.supplies.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_supply_count" })
  async createSuppliesCount(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createCount(principal, body), getRequestIds(req));
  }

  @Post("supplies/counts/:id/items")
  @RequireAnyPermission(
    ["industrial.supplies.count", "industrial.supplies.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async recordSuppliesCountItem(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.recordCountItem(principal, id, body), getRequestIds(req));
  }

  @Post("supplies/counts/:id/submit")
  @RequireAnyPermission(
    [
      "industrial.supplies.count",
      "industrial.supplies.count.approve",
      "industrial.supplies.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async submitSuppliesCount(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.submitCount(principal, id, body), getRequestIds(req));
  }

  @Get("supplies/lots")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesLots(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listLots(principal, query), getRequestIds(req));
  }

  @Get("supplies/expiring")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesExpiring(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listExpiring(principal, query), getRequestIds(req));
  }

  @Post("supplies/inspections")
  @RequireAnyPermission(
    [
      "industrial.supplies.inspection.perform",
      "industrial.supplies.inspection.manage",
      "industrial.supplies.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_supply_inspection" })
  async createSuppliesInspection(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createInspection(principal, body), getRequestIds(req));
  }

  @Get("supplies/requests")
  @RequireAnyPermission(
    ["industrial.supplies.requests.view", "industrial.supplies.requests.create", ...SUPPLIES_VIEW],
    { requiresEntitlement: ENTITLEMENT },
  )
  async suppliesRequests(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listRequests(principal, query), getRequestIds(req));
  }

  @Post("supplies/requests")
  @RequireAnyPermission(
    [
      "industrial.supplies.requests.create",
      "industrial.supplies.manage",
      "industrial.admin",
      "industrial.access",
      "field.access",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_supply_request" })
  async createSuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createRequest(principal, body), getRequestIds(req));
  }

  @Post("supplies/requests/:id/approve")
  @RequireAnyPermission(
    ["industrial.supplies.requests.approve", "industrial.supplies.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async approveSuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.approveRequest(principal, id, body), getRequestIds(req));
  }

  @Post("supplies/requests/:id/fulfill")
  @RequireAnyPermission(["industrial.supplies.requests.fulfill", ...SUPPLIES_ISSUE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async fulfillSuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.fulfillRequest(principal, id, body), getRequestIds(req));
  }

  @Get("supplies/requests/:id")
  @RequireAnyPermission(["industrial.supplies.requests.view", ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getSuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.getRequest(principal, id), getRequestIds(req));
  }

  @Post("supplies/requests/:id/review")
  @RequireAnyPermission(
    ["industrial.supplies.requests.review", "industrial.supplies.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async reviewSuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.beginReview(principal, id), getRequestIds(req));
  }

  @Post("supplies/requests/:id/deny")
  @RequireAnyPermission(
    ["industrial.supplies.requests.deny", "industrial.supplies.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async denySuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.denyRequest(principal, id, body), getRequestIds(req));
  }

  @Post("supplies/requests/:id/assign")
  @RequireAnyPermission(
    ["industrial.supplies.requests.assign", "industrial.supplies.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async assignSuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.assignRequest(principal, id, body), getRequestIds(req));
  }

  @Post("supplies/requests/:id/backorder")
  @RequireAnyPermission(
    [
      "industrial.supplies.requests.approve",
      "industrial.supplies.requests.fulfill",
      ...SUPPLIES_ISSUE,
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async backorderSuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.backorderRequest(principal, id, body), getRequestIds(req));
  }

  @Post("supplies/requests/:id/ready")
  @RequireAnyPermission(
    [
      "industrial.supplies.requests.approve",
      "industrial.supplies.requests.fulfill",
      ...SUPPLIES_ISSUE,
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async readySuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.markReady(principal, id, body), getRequestIds(req));
  }

  @Post("supplies/requests/:id/cancel")
  @RequireAnyPermission(
    ["industrial.supplies.requests.cancel", "industrial.supplies.manage", "industrial.admin"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async cancelSuppliesRequest(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.cancelRequest(principal, id, body), getRequestIds(req));
  }

  @Get("supplies/qr-stations")
  @RequireAnyPermission(["industrial.supplies.requests.view", ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async supplyQrStations(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.listStations(principal, query), getRequestIds(req));
  }

  @Post("supplies/qr-stations")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_request_qr_station" })
  async createSupplyQrStation(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.createStation(principal, body), getRequestIds(req));
  }

  @Patch("supplies/qr-stations/:id")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async patchSupplyQrStation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.updateStation(principal, id, body), getRequestIds(req));
  }

  @Post("supplies/qr-stations/:id/disable")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async disableSupplyQrStation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.setStationStatus(principal, id, "INACTIVE"), getRequestIds(req));
  }

  @Post("supplies/qr-stations/:id/enable")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async enableSupplyQrStation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.setStationStatus(principal, id, "ACTIVE"), getRequestIds(req));
  }

  @Post("supplies/qr-stations/:id/regenerate")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async regenerateSupplyQrStation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.regenerateStationToken(principal, id), getRequestIds(req));
  }

  @Post("supplies/qr-stations/:id/archive")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveSupplyQrStation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.archiveStation(principal, id), getRequestIds(req));
  }

  @Get("supplies/qr-stations/:id/png")
  @RequireAnyPermission(["industrial.supplies.requests.view", ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async supplyQrStationPng(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Query("appBaseUrl") appBaseUrl: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplyQr.stationPng(principal, id, appBaseUrl), getRequestIds(req));
  }

  @Get("supplies/request-analytics")
  @RequireAnyPermission(["industrial.supplies.requests.view", ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async supplyRequestAnalytics(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.supplyQr.requestAnalytics(principal), getRequestIds(req));
  }

  @Get("supplies/vendors")
  @RequireAnyPermission(
    ["industrial.supplies.vendor.view", "industrial.supplies.purchase.view", ...SUPPLIES_VIEW],
    { requiresEntitlement: ENTITLEMENT },
  )
  async suppliesVendors(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listVendors(principal, query), getRequestIds(req));
  }

  @Post("supplies/vendors")
  @RequireAnyPermission([...SUPPLIES_PURCHASE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_vendor" })
  async createSuppliesVendor(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createVendor(principal, body), getRequestIds(req));
  }

  @Get("supplies/purchase-orders")
  @RequireAnyPermission([...SUPPLIES_PURCHASE, ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async suppliesPurchaseOrders(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listPurchaseOrders(principal, query), getRequestIds(req));
  }

  @Post("supplies/purchase-orders")
  @RequireAnyPermission([...SUPPLIES_PURCHASE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_purchase_order" })
  async createSuppliesPurchaseOrder(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createPurchaseOrder(principal, body), getRequestIds(req));
  }

  @Patch("supplies/purchase-orders/:id/status")
  @RequireAnyPermission([...SUPPLIES_PURCHASE], { requiresEntitlement: ENTITLEMENT })
  async patchSuppliesPurchaseOrderStatus(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.supplies.updatePurchaseOrderStatus(principal, id, body),
      getRequestIds(req),
    );
  }

  @Get("supplies/reorder")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesReorder(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.supplies.listReorder(principal), getRequestIds(req));
  }

  @Get("supplies/kits")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesKits(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listKits(principal, query), getRequestIds(req));
  }

  @Post("supplies/kits")
  @RequireAnyPermission([...SUPPLIES_MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_supply_kit" })
  async createSuppliesKit(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.createKit(principal, body), getRequestIds(req));
  }

  @Get("supplies/kits/:id")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async getSuppliesKit(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.getKit(principal, id), getRequestIds(req));
  }

  @Get("supplies/transactions")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesTransactions(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.listTransactions(principal, query), getRequestIds(req));
  }

  @Get("supplies/reports/usage")
  @RequireAnyPermission(["industrial.supplies.reports.view", ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async suppliesUsageReport(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.usageReport(principal, query), getRequestIds(req));
  }

  @Get("supplies/reports/custom")
  @RequireAnyPermission(["industrial.supplies.reports.view", ...SUPPLIES_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async suppliesCustomReport(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.supplies.customReport(principal, query), getRequestIds(req));
  }

  @Post("supplies/scan/resolve")
  @RequireAnyPermission([...SUPPLIES_VIEW], { requiresEntitlement: ENTITLEMENT })
  async suppliesScanResolve(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.supplies.resolveScan(principal, String(body.code ?? "")),
      getRequestIds(req),
    );
  }

  @Get("messaging/threads")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingThreads(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.messaging.listThreads(principal), getRequestIds(req));
  }

  @Get("messaging/unread-summary")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingUnreadSummary(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.messaging.unreadSummary(principal), getRequestIds(req));
  }

  @Post("messaging/threads")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingCreateThread(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.messaging.createThread(principal, body), getRequestIds(req));
  }

  @Patch("messaging/threads/:id")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingUpdateThread(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.messaging.updateThread(principal, id, body), getRequestIds(req));
  }

  @Delete("messaging/threads/:id")
  @RequireAnyPermission(["industrial.access", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingDeleteThread(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.messaging.deleteThread(principal, id), getRequestIds(req));
  }

  @Get("messaging/threads/:id")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingThread(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.messaging.getThread(principal, id, query), getRequestIds(req));
  }

  @Post("messaging/threads/:id/read")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingRead(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.messaging.markRead(principal, id), getRequestIds(req));
  }

  @Post("messaging/threads/:id/messages")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingPost(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.messaging.sendMessage(principal, id, body), getRequestIds(req));
  }

  @Post("messaging/attachments/upload-url")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingAttachmentUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.messaging.createAttachmentUploadUrl(principal, body), getRequestIds(req));
  }

  @Post("messaging/attachments/:id/complete")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingAttachmentComplete(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.messaging.completeAttachmentUpload(principal, id), getRequestIds(req));
  }

  @Get("messaging/attachments/:id/download-url")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingAttachmentDownloadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.messaging.createAttachmentDownloadUrl(principal, id), getRequestIds(req));
  }

  @Get("messaging/attachments/:id/content")
  @RequireAnyPermission(["industrial.access", "industrial.admin", "field.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async messagingAttachmentContent(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const file = await this.messaging.getAttachmentContent(principal, id);
    const safeName =
      file.filename
        .replace(/"/g, "")
        .replace(/[^\w.\-() ]+/g, "_")
        .slice(0, 180) || "attachment";
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `${file.disposition}; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    if (file.contentLength) {
      res.setHeader("Content-Length", String(file.contentLength));
    }
    file.body.pipe(res);
  }

  @Get("emergency-response/:category")
  @RequireAnyPermission(
    ["industrial.access", "industrial.admin", "field.emergency.view", "field.access"],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
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

  @Get("loto")
  @RequireAnyPermission([...LOTO_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listLoto(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listLoto(principal, query), req);
  }

  @Get("loto-records")
  @RequireAnyPermission([...LOTO_VIEW], {
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

  @Get("loto-records/:id")
  @RequireAnyPermission([...LOTO_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getLotoRecord(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getLotoLockoutDetail(principal, id), getRequestIds(req));
  }

  @Post("loto-records/:id/verify")
  @RequireAnyPermission([...LOTO_EXECUTE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async verifyLotoRecord(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.transitionLotoLockout(principal, id, "verify", body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("loto-records/:id/close")
  @RequireAnyPermission([...LOTO_EXECUTE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async closeLotoRecord(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.transitionLotoLockout(principal, id, "close", body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("loto-records/:id/:action")
  @RequireAnyPermission([...LOTO_MANAGE], {
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
  @RequireAnyPermission([...LOTO_VIEW], {
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
  @RequireAnyPermission([...LOTO_VIEW], {
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
  @RequireAnyPermission([...LOTO_AUTHOR], {
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

  @Patch("loto/:id")
  @RequireAnyPermission([...LOTO_AUTHOR], {
    requiresEntitlement: ENTITLEMENT,
  })
  async patchLoto(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updateLoto(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("loto/:id/archive")
  @RequireAnyPermission([...LOTO_AUTHOR], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveLoto(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.transitionModule(principal, "loto", id, "archive", {}),
      getRequestIds(req),
    );
  }

  @Post("loto/:id/issue")
  @RequireAnyPermission([...LOTO_EXECUTE], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_loto_issue" })
  async issueLoto(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.issueLotoLockout(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("loto/:id/:action")
  @RequireAnyPermission([...LOTO_TRANSITION], {
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
    const actionKey = String(action ?? "")
      .trim()
      .toLowerCase();
    const ehsOnlyActions = new Set(["request-changes", "return", "send-back", "reject"]);
    const activateActions = new Set(["approve", "activate"]);
    const authorActions = new Set([
      "submit",
      "submit-review",
      "submit-approval",
      "reopen",
      "close",
      "archive",
    ]);
    if (ehsOnlyActions.has(actionKey)) {
      const allowed =
        principal.isPlatformAdmin || LOTO_APPROVE.some((code) => principal.permissions.has(code));
      if (!allowed) {
        throw new ForgeError(
          "FORBIDDEN",
          "EHS Director approval permission is required for this action.",
        );
      }
    } else if (activateActions.has(actionKey)) {
      const allowed =
        principal.isPlatformAdmin ||
        LOTO_APPROVE.some((code) => principal.permissions.has(code)) ||
        LOTO_AUTHOR.some((code) => principal.permissions.has(code));
      if (!allowed) {
        throw new ForgeError("FORBIDDEN", "You do not have permission to activate this procedure.");
      }
    } else if (authorActions.has(actionKey)) {
      const allowed =
        principal.isPlatformAdmin || LOTO_AUTHOR.some((code) => principal.permissions.has(code));
      if (!allowed) {
        throw new ForgeError("FORBIDDEN", "You do not have permission to submit this procedure.");
      }
    }
    return ok(
      await this.domain.transitionModule(principal, "loto", id, action, body ?? {}),
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
    return this.listOk(await this.taskExtras.listTasksEnriched(principal, query), req);
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
    const created = await this.domain.createTask(principal, body);
    const id = String((created as { id?: string }).id ?? "");
    if (id) {
      await this.taskExtras.recordActivity(principal, id, "task.created", {
        title: (created as { title?: string }).title ?? body.title,
      });
      if (body.assigneePersonnelId) {
        await this.taskExtras.recordActivity(principal, id, "task.assigned", {
          assigneePersonnelId: body.assigneePersonnelId,
        });
      }
    }
    return ok(created, getRequestIds(req));
  }

  @Patch("tasks/:id")
  @RequireAnyPermission(["industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateTask(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const updated = await this.domain.updateTask(principal, id, body);
    if (body.assigneePersonnelId !== undefined) {
      await this.taskExtras.recordActivity(principal, id, "task.assigned", {
        assigneePersonnelId: body.assigneePersonnelId,
      });
    } else {
      await this.taskExtras.recordActivity(principal, id, "task.updated", {});
    }
    return ok(updated, getRequestIds(req));
  }

  /** Soft-delete. Service enforces Admin, Creator, or task author only. */
  @Post("tasks/:id/archive")
  @RequireAnyPermission(["industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveTask(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    const result = await this.domain.archiveTask(principal, id);
    await this.taskExtras.recordActivity(principal, id, "task.archived", {});
    return ok(result, getRequestIds(req));
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
    const result = await this.domain.taskAction(principal, id, action);
    await this.taskExtras.recordActivity(principal, id, `task.${action}`, {});
    return ok(result, getRequestIds(req));
  }

  /**
   * Incidents summary tiles (category + status counts). Must stay above the
   * generic :module/:id catch-all so "summary" is not parsed as an id.
   */
  @Get("incidents/summary")
  @RequireAnyPermission(["industrial.incidents.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async incidentsSummary(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.domain.incidentsSummary(principal), getRequestIds(req));
  }

  @Get("incidents")
  @RequireAnyPermission(["industrial.incidents.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listIncidents(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listIncidentsDetailed(principal, query), req);
  }

  @Post("incidents")
  @RequireAnyPermission(
    [
      "industrial.incidents.manage",
      "industrial.incidents.view",
      "industrial.admin",
      "industrial.access",
      "field.incidents.create",
      "field.access",
    ],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
  @Idempotent({ resourceType: "industrial_incidents" })
  async createIncident(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createIncident(principal, body), getRequestIds(req));
  }

  @Patch("incidents/:id")
  @RequireAnyPermission(
    [
      "industrial.incidents.manage",
      "industrial.incidents.view",
      "industrial.admin",
      "industrial.access",
      "field.incidents.create",
      "field.access",
    ],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
  async patchIncident(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updateIncident(principal, id, body ?? {}), getRequestIds(req));
  }

  /** Soft-delete. Service enforces EHS Director or Creator only. */
  @Post("incidents/:id/archive")
  @RequireAnyPermission(["industrial.incidents.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveIncident(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.archiveIncident(principal, id), getRequestIds(req));
  }

  @Get("incidents/:id/printable")
  @RequireAnyPermission(["industrial.incidents.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async incidentPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.incidentPrintable(principal, id), getRequestIds(req));
  }

  @Post("incidents/:id/rca/printable")
  @RequireAnyPermission(["industrial.incidents.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async incidentRcaPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.incidentRcaPrintable(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("incidents/:id/osha-form-301")
  @RequireAnyPermission(
    ["industrial.incidents.view", "industrial.osha.view", "industrial.admin", "industrial.access"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async incidentOshaForm301(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.incidentOshaForm301(principal, id), getRequestIds(req));
  }

  @Post("incidents/:id/attachments/upload-url")
  @RequireAnyPermission(["industrial.incidents.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_incident_attachment" })
  async createIncidentAttachmentUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const payload: { filename?: string; mimeType?: string; contentLength?: number } = {};
    if (typeof body.filename === "string") payload.filename = body.filename;
    if (typeof body.mimeType === "string") payload.mimeType = body.mimeType;
    if (body.contentLength != null && Number.isFinite(Number(body.contentLength))) {
      payload.contentLength = Number(body.contentLength);
    }
    return ok(
      await this.incidentAttachments.createUploadUrl(principal, id, payload),
      getRequestIds(req),
    );
  }

  @Post("incidents/:id/attachments/complete")
  @RequireAnyPermission(["industrial.incidents.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_incident_attachment_complete" })
  async completeIncidentAttachmentUpload(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const raw =
      typeof body.documentId === "string"
        ? body.documentId
        : typeof body.document_id === "string"
          ? body.document_id
          : "";
    return ok(
      await this.incidentAttachments.completeUpload(principal, id, {
        documentId: raw.trim(),
      }),
      getRequestIds(req),
    );
  }

  @Get("incidents/:id/attachments/:documentId/download-url")
  @RequireAnyPermission(["industrial.incidents.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async incidentAttachmentDownloadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.incidentAttachments.createDownloadUrl(principal, id, documentId),
      getRequestIds(req),
    );
  }

  @Delete("incidents/:id/attachments/:documentId")
  @RequireAnyPermission(["industrial.incidents.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async deleteIncidentAttachment(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.incidentAttachments.deleteAttachment(principal, id, documentId),
      getRequestIds(req),
    );
  }

  @Post("forms/import")
  @RequireAnyPermission([...MODULE_MANAGE.forms], { requiresEntitlement: ENTITLEMENT })
  async importFormCatalog(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.importFormCatalog(principal, body ?? {}), getRequestIds(req));
  }

  @Post("forms/import-file")
  @RequireAnyPermission([...MODULE_MANAGE.forms], { requiresEntitlement: ENTITLEMENT })
  async importFormChecklistFile(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.importFormChecklistFile(principal, body ?? {}), getRequestIds(req));
  }

  @Get("forms/:id/printable")
  @RequireAnyPermission([...MODULE_VIEW.forms], { requiresEntitlement: ENTITLEMENT })
  async formDefinitionPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.formDefinitionPrintable(principal, id), getRequestIds(req));
  }

  @Patch("forms/:id")
  @RequireAnyPermission([...MODULE_MANAGE.forms], { requiresEntitlement: ENTITLEMENT })
  async patchFormDefinition(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.updateFormDefinition(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  /** Soft-delete. Service enforces Tenant Admin or Creator only. */
  @Post("forms/:id/archive")
  @RequireAnyPermission([...MODULE_VIEW.forms], { requiresEntitlement: ENTITLEMENT })
  async archiveFormDefinition(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.archiveFormDefinition(principal, id), getRequestIds(req));
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
  @RequireAnyPermission([...FORM_SUBMIT], { requiresEntitlement: ENTITLEMENT })
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
  @RequireAnyPermission([...FORM_SUBMIT], { requiresEntitlement: ENTITLEMENT })
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

  @Get("form-signatories")
  @RequireAnyPermission([...MODULE_VIEW.forms], { requiresEntitlement: ENTITLEMENT })
  async listFormSignatories(
    @Principal() principal: ForgePrincipal,
    @Query("kind") kind: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.listFormSignatoryRecipients(principal, kind), getRequestIds(req));
  }

  @Post("form-submissions/:id/request-signature")
  @RequireAnyPermission([...MODULE_MANAGE.forms], { requiresEntitlement: ENTITLEMENT })
  async requestFormSignature(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.requestFormSignature(principal, id, body ?? {}),
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

  @Post("inspection-templates/import-file")
  @RequireAnyPermission([...MODULE_MANAGE.inspections], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_inspection_templates_import" })
  async importInspectionTemplateFile(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.importInspectionTemplateFile(principal, body ?? {}),
      getRequestIds(req),
    );
  }

  @Patch("inspection-templates/:id")
  @RequireAnyPermission([...MODULE_MANAGE.inspections], { requiresEntitlement: ENTITLEMENT })
  async renameInspectionTemplate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.renameInspectionTemplate(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Get("departments")
  @RequireAnyPermission(
    [
      "industrial.personnel.view",
      "industrial.inspections.view",
      "industrial.loto.view",
      "industrial.loto.create",
      "industrial.loto.edit",
      "industrial.loto.manage",
      "industrial.admin",
      "industrial.access",
      "field.inspections.perform",
      "field.access",
    ],
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

  @Post("inspections/:id/delete")
  @RequireAnyPermission(["industrial.admin", "industrial.inspections.manage"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_inspections_delete" })
  async deleteInspection(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.deleteInspection(principal, id), getRequestIds(req));
  }

  @Post("inspection-attachments")
  @RequireAnyPermission([...MODULE_MANAGE.inspections], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_attachments" })
  async createInspectionAttachment(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.domain.createInspectionAttachment(principal, body ?? {}),
      getRequestIds(req),
    );
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
    return ok(
      await this.domain.updateDepartmentContact(principal, id, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("corrective-actions/:id/complete")
  @RequireAnyPermission(
    [
      "industrial.corrective_actions.manage",
      "industrial.corrective_actions.view",
      "industrial.admin",
      "industrial.access",
      "field.correctiveActions.complete",
      "field.access",
    ],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
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
  @Get("osha")
  @RequireAnyPermission(["industrial.osha.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listOsha(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.domain.listOsha(principal, query), req);
  }

  @Post("osha")
  @RequireAnyPermission(["industrial.osha.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_osha_case" })
  async createOsha(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.createOsha(principal, body ?? {}), getRequestIds(req));
  }

  @Get("osha/:id")
  @RequireAnyPermission(["industrial.osha.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getOsha(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getOsha(principal, id), getRequestIds(req));
  }

  @Patch("osha/:id")
  @RequireAnyPermission(["industrial.osha.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateOsha(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updateOsha(principal, id, body ?? {}), getRequestIds(req));
  }

  @Get("osha-form-300a")
  @RequireAnyPermission(["industrial.osha.view", "industrial.admin", "industrial.access"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getOshaForm300AMeta(
    @Principal() principal: ForgePrincipal,
    @Query() query: { year?: string; siteId?: string; establishment?: string },
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.getOshaForm300AMeta(principal, query ?? {}), getRequestIds(req));
  }

  @Put("osha-form-300a")
  @RequireAnyPermission(["industrial.osha.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async upsertOshaForm300AMeta(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.upsertOshaForm300AMeta(principal, body ?? {}), getRequestIds(req));
  }

  @Post("dot/documents/upload-url")
  @RequireAnyPermission(["industrial.dot.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_dot_dqf_upload" })
  async dotDqfUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.dotDqfDocuments.createUploadUrl(principal, body), getRequestIds(req));
  }

  @Post("dot/documents/complete")
  @RequireAnyPermission(["industrial.dot.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_dot_dqf_complete" })
  async dotDqfComplete(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.dotDqfDocuments.completeUpload(principal, body), getRequestIds(req));
  }

  @Get("dot/documents/:documentId/download-url")
  @RequireAnyPermission(
    ["industrial.dot.view", "industrial.dot.manage", "industrial.admin", "industrial.access"],
    { requiresEntitlement: ENTITLEMENT },
  )
  async dotDqfDownloadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.dotDqfDocuments.createDownloadUrl(principal, documentId),
      getRequestIds(req),
    );
  }

  @Get("dot/:id/printable")
  @RequireAnyPermission(["industrial.dot.view", "industrial.dot.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async dotDvirPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.dvirPrintable(principal, id), getRequestIds(req));
  }

  @Patch("dot/:id")
  @RequireAnyPermission(["industrial.dot.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateDot(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.updateDot(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("dot/:id/dvir-certify")
  @RequireAnyPermission(["industrial.dot.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async certifyDvir(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.domain.certifyDvir(principal, id, body ?? {}), getRequestIds(req));
  }

  @Get(":module")
  @RequireAnyPermission(
    [
      "industrial.access",
      "industrial.admin",
      "field.access",
      "field.jsa.execute",
      "field.sds.view",
      "field.permits.view",
    ],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
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
    if (moduleKey === "osha") {
      return this.listOk(await this.domain.listOsha(principal, query), req);
    }
    if (!(moduleKey in MODULE_VIEW)) {
      return this.listOk({ items: [], page: 1, pageSize: 25 }, req);
    }
    return this.listOk(await this.domain.listModule(principal, moduleKey, query), req);
  }

  @Post(":module")
  @RequireAnyPermission(
    [
      "industrial.admin",
      "industrial.access",
      "field.access",
      "field.observations.create",
      "field.hazards.create",
      "field.incidents.create",
      "field.fleet.inspect",
    ],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
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
    if (moduleKey === "osha") {
      return ok(await this.domain.createOsha(principal, body ?? {}), getRequestIds(req));
    }
    if (moduleKey === "inspections") {
      return ok(await this.domain.createInspection(principal, body), getRequestIds(req));
    }
    if (moduleKey === "observations") {
      return ok(await this.domain.createObservation(principal, body ?? {}), getRequestIds(req));
    }
    return ok(await this.domain.createModule(principal, moduleKey, body), getRequestIds(req));
  }

  @Get(":module/:id")
  @RequireAnyPermission(
    [
      "industrial.access",
      "industrial.admin",
      "field.access",
      "field.jsa.execute",
      "field.sds.view",
      "field.permits.view",
    ],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
  async getGenericModule(
    @Principal() principal: ForgePrincipal,
    @Param("module") moduleKey: string,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    if (!(moduleKey in MODULE_VIEW)) {
      return ok(null, getRequestIds(req));
    }
    if (moduleKey === "osha") {
      return ok(await this.domain.getOsha(principal, id), getRequestIds(req));
    }
    return ok(
      await this.domain.getModule(principal, moduleKey as ModuleKey, id),
      getRequestIds(req),
    );
  }

  @Post(":module/:id/:action")
  @RequireAnyPermission(
    [
      "industrial.admin",
      "industrial.access",
      "field.access",
      "field.jsa.execute",
      "field.permits.view",
      "field.permits.approve",
    ],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
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
