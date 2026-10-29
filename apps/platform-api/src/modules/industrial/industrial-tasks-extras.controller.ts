import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialTasksExtrasService } from "./industrial-tasks-extras.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };

const VIEW = ["industrial.access", "industrial.admin"] as const;
const MANAGE = ["industrial.admin", "industrial.access"] as const;

/**
 * Nested task routes registered before IndustrialFlatController catch-alls.
 */
@Controller("api/v1/industrial/tasks")
export class IndustrialTasksExtrasController {
  constructor(private readonly extras: IndustrialTasksExtrasService) {}

  @Get(":id/detail")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async detail(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.extras.getTaskDetail(principal, id), getRequestIds(req));
  }

  @Get(":id/subtasks")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listSubtasks(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.extras.listSubtasks(principal, id), getRequestIds(req));
  }

  @Post(":id/subtasks")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_task_subtasks" })
  async createSubtask(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.extras.createSubtask(principal, id, body ?? {}), getRequestIds(req));
  }

  @Patch(":id/subtasks/:subId")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateSubtask(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("subId") subId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.extras.updateSubtask(principal, id, subId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post(":id/subtasks/:subId/archive")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveSubtask(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("subId") subId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.extras.archiveSubtask(principal, id, subId), getRequestIds(req));
  }

  @Get(":id/checklist")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listChecklist(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.extras.listChecklist(principal, id), getRequestIds(req));
  }

  @Post(":id/checklist")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_task_checklist_items" })
  async createChecklist(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.extras.createChecklistItem(principal, id, body ?? {}), getRequestIds(req));
  }

  @Patch(":id/checklist/:itemId")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async updateChecklist(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.extras.updateChecklistItem(principal, id, itemId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post(":id/checklist/:itemId/archive")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archiveChecklist(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.extras.archiveChecklistItem(principal, id, itemId), getRequestIds(req));
  }

  @Get(":id/activity")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listActivity(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.extras.listActivity(principal, id), getRequestIds(req));
  }

  @Post(":id/reminders")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_reminders" })
  async createReminders(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.extras.createTaskReminders(principal, id, body ?? {}), getRequestIds(req));
  }
}
