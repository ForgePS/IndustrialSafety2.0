import {
  Body,
  Controller,
  Delete,
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
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialEmergencyAlertsService } from "./industrial-emergency-alerts.service.js";
import { IndustrialQrService } from "./industrial-qr.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };

const VIEW = [
  "industrial.emergency_alerts.view",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
  "field.emergency.view",
  "field.access",
] as const;

const CREATE = [
  "industrial.emergency_alerts.create",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const SEND = [
  "industrial.emergency_alerts.send",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const UPDATE = [
  "industrial.emergency_alerts.update",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const CLEAR = [
  "industrial.emergency_alerts.clear",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const CANCEL = [
  "industrial.emergency_alerts.cancel",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const TEMPLATES = [
  "industrial.emergency_alerts.manage_templates",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const MVIX = [
  "industrial.emergency_alerts.manage_mvix",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const SETTINGS = [
  "industrial.emergency_alerts.manage_settings",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
] as const;

const GROUPS = [
  "industrial.emergency_alerts.manage_groups",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
] as const;

/**
 * Emergency Alerts mass-notification API.
 * Registered before IndustrialFlatController so paths are not swallowed by :module/:id.
 */
@Controller("api/v1/industrial/emergency-alerts")
export class IndustrialEmergencyAlertsController {
  constructor(
    private readonly alerts: IndustrialEmergencyAlertsService,
    private readonly qr: IndustrialQrService,
  ) {}

  @Get("dashboard")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async dashboard(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.alerts.dashboard(principal), getRequestIds(req));
  }

  @Get()
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async list(
    @Principal() principal: ForgePrincipal,
    @Query() query: Record<string, string | undefined>,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.alerts.listAlerts(principal, {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.limit ? { limit: Number(query.limit) } : {}),
    });
    return ok(data, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Post()
  @RequireAnyPermission([...CREATE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_emergency_alert" })
  async create(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.createAlert(principal, body ?? {}), getRequestIds(req));
  }

  @Get("templates")
  @RequireAnyPermission([...VIEW, ...TEMPLATES], { requiresEntitlement: ENTITLEMENT })
  async listTemplates(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.alerts.listTemplates(principal), getRequestIds(req));
  }

  @Post("templates")
  @RequireAnyPermission([...TEMPLATES], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_emergency_alert_template" })
  async createTemplate(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.createTemplate(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("templates/:id")
  @RequireAnyPermission([...TEMPLATES], { requiresEntitlement: ENTITLEMENT })
  async updateTemplate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.updateTemplate(principal, id, body ?? {}), getRequestIds(req));
  }

  @Delete("templates/:id")
  @RequireAnyPermission([...TEMPLATES], { requiresEntitlement: ENTITLEMENT })
  async deleteTemplate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.deleteTemplate(principal, id), getRequestIds(req));
  }

  @Get("settings")
  @RequireAnyPermission([...VIEW, ...SETTINGS], { requiresEntitlement: ENTITLEMENT })
  async settings(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.alerts.getOrCreateSettings(principal), getRequestIds(req));
  }

  @Patch("settings")
  @RequireAnyPermission([...SETTINGS], { requiresEntitlement: ENTITLEMENT })
  async updateSettings(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.updateSettings(principal, body ?? {}), getRequestIds(req));
  }

  @Get("sms-signup-qr")
  @RequireAnyPermission([...VIEW, ...SETTINGS], { requiresEntitlement: ENTITLEMENT })
  async getSmsSignupQr(
    @Principal() principal: ForgePrincipal,
    @Query("appBaseUrl") appBaseUrl: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.qr.resolveEmergencySmsSignupQr(principal, { appBaseUrl: appBaseUrl ?? null }),
      getRequestIds(req),
    );
  }

  @Post("sms-signup-qr")
  @RequireAnyPermission([...SETTINGS], { requiresEntitlement: ENTITLEMENT })
  async createSmsSignupQr(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.qr.resolveEmergencySmsSignupQr(principal, {
        appBaseUrl: typeof body?.appBaseUrl === "string" ? body.appBaseUrl : null,
        create: true,
      }),
      getRequestIds(req),
    );
  }

  @Get("targets")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async targets(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.alerts.listTargets(principal), getRequestIds(req));
  }

  @Post("audience/preview")
  @RequireAnyPermission([...VIEW, ...CREATE], { requiresEntitlement: ENTITLEMENT })
  async previewAudience(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.previewAudience(principal, body ?? {}), getRequestIds(req));
  }

  @Get("groups")
  @RequireAnyPermission([...VIEW, ...GROUPS], { requiresEntitlement: ENTITLEMENT })
  async listGroups(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.alerts.listGroups(principal), getRequestIds(req));
  }

  @Get("groups/:id")
  @RequireAnyPermission([...VIEW, ...GROUPS], { requiresEntitlement: ENTITLEMENT })
  async getGroup(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.getGroup(principal, id), getRequestIds(req));
  }

  @Post("groups")
  @RequireAnyPermission([...GROUPS], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_emergency_alert_group" })
  async createGroup(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.createGroup(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("groups/:id")
  @RequireAnyPermission([...GROUPS], { requiresEntitlement: ENTITLEMENT })
  async updateGroup(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.updateGroup(principal, id, body ?? {}), getRequestIds(req));
  }

  @Get("cap/feeds")
  @RequireAnyPermission([...VIEW, ...MVIX], { requiresEntitlement: ENTITLEMENT })
  async listCapFeeds(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.alerts.listCapFeeds(principal), getRequestIds(req));
  }

  @Post("cap/feeds")
  @RequireAnyPermission([...MVIX], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_emergency_alert_cap_feed" })
  async createCapFeed(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.createCapFeed(principal, body ?? {}), getRequestIds(req));
  }

  @Get(":id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async get(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.getAlert(principal, id), getRequestIds(req));
  }

  @Patch(":id")
  @RequireAnyPermission([...CREATE], { requiresEntitlement: ENTITLEMENT })
  async patch(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.updateDraft(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post(":id/send")
  @RequireAnyPermission([...SEND], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_emergency_alert_send" })
  async send(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.sendAlert(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post(":id/acknowledge")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_emergency_alert_ack" })
  async acknowledge(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.acknowledgeAlert(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post(":id/update")
  @RequireAnyPermission([...UPDATE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_emergency_alert_update" })
  async update(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.updateActive(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post(":id/all-clear")
  @RequireAnyPermission([...CLEAR], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_emergency_alert_clear" })
  async allClear(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.allClear(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post(":id/cancel")
  @RequireAnyPermission([...CANCEL], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_emergency_alert_cancel" })
  async cancel(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.alerts.cancelAlert(principal, id), getRequestIds(req));
  }
}
