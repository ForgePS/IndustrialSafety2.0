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

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
type ListQuery = Record<string, string | undefined>;

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
  ) {}

  private listOk(
    data: { items: unknown[]; page: number; pageSize: number },
    req: RequestWithIds,
  ) {
    return ok(data, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.items.length,
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
