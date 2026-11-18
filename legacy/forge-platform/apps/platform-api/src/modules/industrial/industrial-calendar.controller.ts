import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialCalendarService } from "./industrial-calendar.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
type ListQuery = Record<string, string | undefined>;

const VIEW = ["industrial.access", "industrial.admin", "field.access"] as const;
const MANAGE = ["industrial.admin", "industrial.access", "field.access"] as const;

/**
 * Calendar + reminders under dedicated paths so flat `:module/:id` does not swallow them.
 */
@Controller("api/v1/industrial/calendar")
export class IndustrialCalendarController {
  constructor(private readonly calendar: IndustrialCalendarService) {}

  @Get("categories")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listCategories(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.calendar.listCategories(principal), getRequestIds(req));
  }

  @Post("categories")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_calendar_categories" })
  async createCategory(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.createCategory(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("categories/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateCategory(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.updateCategory(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("categories/:id/archive")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveCategory(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.archiveCategory(principal, id), getRequestIds(req));
  }

  @Get("upcoming")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async upcoming(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.upcoming(principal, query), getRequestIds(req));
  }

  @Get("events")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listEvents(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.listEvents(principal, query), getRequestIds(req));
  }

  @Get("events/:id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async getEvent(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.getEvent(principal, id), getRequestIds(req));
  }

  @Post("events")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_calendar_events" })
  async createEvent(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.createEvent(principal, body ?? {}), getRequestIds(req));
  }

  @Patch("events/:id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateEvent(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.updateEvent(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post("events/:id/archive")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveEvent(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.archiveEvent(principal, id), getRequestIds(req));
  }

  @Post("events/:id/link-task")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async linkTask(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.linkTask(principal, id, body ?? {}), getRequestIds(req));
  }

  @Get("task-links/:taskId")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async taskLinks(
    @Principal() principal: ForgePrincipal,
    @Param("taskId") taskId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.linksForTask(principal, taskId), getRequestIds(req));
  }
}

@Controller("api/v1/industrial/reminders")
export class IndustrialRemindersController {
  constructor(private readonly calendar: IndustrialCalendarService) {}

  @Get()
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listReminders(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.listReminders(principal, query), getRequestIds(req));
  }

  @Post("process-due")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async processDue(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.calendar.processDueReminders(principal), getRequestIds(req));
  }

  @Post()
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_reminders" })
  async createReminder(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.createReminder(principal, body ?? {}), getRequestIds(req));
  }

  @Patch(":id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateReminder(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.updateReminder(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post(":id/cancel")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async cancelReminder(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.calendar.cancelReminder(principal, id), getRequestIds(req));
  }
}
