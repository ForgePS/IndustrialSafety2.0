import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { CadConflictsService } from "./cad-conflicts.service.js";

@Controller()
export class CadConflictsController {
  constructor(private readonly conflicts: CadConflictsService) {}

  @Get("api/v1/tenants/:tenantId/cad/conflicts")
  @RequirePermission("rms.cad.conflict.view")
  async list(
    @Param("tenantId") tenantId: string,
    @Query("status") status: string | undefined,
    @Query("incidentId") incidentId: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const query: { status?: string; incidentId?: string } = {};
    if (status) query.status = status;
    if (incidentId) query.incidentId = incidentId;
    const data = await this.conflicts.listConflicts(tenantId, query);
    return ok(data, getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/cad/conflicts/:conflictId")
  @RequirePermission("rms.cad.conflict.view")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("conflictId") conflictId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.conflicts.getConflict(tenantId, conflictId), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/cad/conflicts/:conflictId/resolve")
  @RequirePermission("rms.cad.conflict.resolve")
  async resolve(
    @Param("tenantId") tenantId: string,
    @Param("conflictId") conflictId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.conflicts.resolve(tenantId, conflictId, body, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/cad/conflicts/:conflictId/escalate")
  @RequirePermission("rms.cad.conflict.escalate")
  async escalate(
    @Param("tenantId") tenantId: string,
    @Param("conflictId") conflictId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const payload =
      typeof body === "object" && body
        ? { ...(body as Record<string, unknown>), resolutionAction: "ESCALATE" }
        : { resolutionAction: "ESCALATE", resolutionReason: "Escalated", recordVersion: 1 };
    return ok(
      await this.conflicts.resolve(tenantId, conflictId, payload, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/neris/incidents/:incidentId/cad-link")
  @RequirePermission("rms.cad.view")
  async getLink(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.conflicts.getIncidentLink(tenantId, incidentId), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/neris/incidents/:incidentId/cad-link")
  @RequirePermission("rms.cad.incident.link")
  async link(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.conflicts.linkIncident(tenantId, incidentId, body, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/neris/incidents/:incidentId/cad-unlink")
  @RequirePermission("rms.cad.incident.unlink")
  async unlink(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.conflicts.unlinkIncident(tenantId, incidentId, body, principal),
      getRequestIds(req),
    );
  }
}
