import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { IncidentAssignmentsService } from "./incident-assignments.service.js";
import { NerisIncidentsService } from "./neris-incidents.service.js";

@Controller("api/v1/tenants/:tenantId/neris/incidents")
export class NerisIncidentsController {
  constructor(
    private readonly incidents: NerisIncidentsService,
    private readonly assignments: IncidentAssignmentsService,
  ) {}

  @Post()
  @RequirePermission("rms.neris.incident.create")
  @Idempotent({ resourceType: "neris_incident" })
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.incidents.create(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get()
  @RequirePermission("rms.neris.incident.view")
  async list(
    @Param("tenantId") tenantId: string,
    @Query() query: Record<string, string>,
    @Req() req: RequestWithIds,
  ) {
    const result = await this.incidents.list(tenantId, query);
    return ok(result.items, getRequestIds(req), {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }

  @Post("duplicates/check")
  @RequirePermission("rms.neris.incident.view")
  async checkDuplicates(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Query("excludeIncidentId") excludeIncidentId: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.incidents.checkDuplicates(tenantId, body, excludeIncidentId),
      getRequestIds(req),
    );
  }

  @Get(":incidentId")
  @RequirePermission("rms.neris.incident.view")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.incidents.get(tenantId, incidentId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":incidentId")
  @RequirePermission("rms.neris.incident.edit")
  async patch(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "neris_incident");
    const data = await this.incidents.patch(tenantId, incidentId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":incidentId/field-values")
  @RequirePermission("rms.neris.incident.edit")
  async batchFieldValues(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "neris_incident");
    const data = await this.incidents.batchUpsertFieldValues(
      tenantId,
      incidentId,
      body,
      principal,
      expected,
    );
    setETag(res, data.incident.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":incidentId/validate")
  @RequirePermission("rms.neris.validation.view")
  async validate(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.incidents.validate(tenantId, incidentId, principal), getRequestIds(req));
  }

  @Post(":incidentId/submit-for-review")
  @RequirePermission("rms.neris.incident.submit_review")
  async submitForReview(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.incidents.submitForReview(tenantId, incidentId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":incidentId/return")
  @RequirePermission("rms.neris.incident.return")
  async returnIncident(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.incidents.returnIncident(tenantId, incidentId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":incidentId/approve")
  @RequirePermission("rms.neris.incident.approve")
  async approve(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.incidents.approve(tenantId, incidentId, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":incidentId/finalize")
  @RequirePermission("rms.neris.incident.finalize")
  async finalize(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.incidents.finalize(tenantId, incidentId, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":incidentId/void")
  @RequirePermission("rms.neris.incident.void")
  async voidIncident(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.incidents.voidIncident(tenantId, incidentId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":incidentId/archive")
  @RequirePermission("rms.neris.incident.archive")
  async archive(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.incidents.archive(tenantId, incidentId, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get(":incidentId/form-descriptor")
  @RequirePermission("rms.neris.incident.view")
  async formDescriptor(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.incidents.getFormDescriptor(tenantId, incidentId), getRequestIds(req));
  }

  @Post(":incidentId/specialty-sections")
  @RequirePermission("rms.neris.incident.edit")
  async updateSpecialtySection(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: { sectionKey?: string; action?: string },
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const action = body.action;
    if (
      action !== "ACTIVATE" &&
      action !== "MARK_NOT_APPLICABLE" &&
      action !== "CLEAR_NOT_APPLICABLE"
    ) {
      throw new ForgeError(
        "BAD_REQUEST",
        "action must be ACTIVATE, MARK_NOT_APPLICABLE, or CLEAR_NOT_APPLICABLE",
      );
    }
    const data = await this.incidents.updateSpecialtySection(tenantId, incidentId, principal, {
      sectionKey: String(body.sectionKey ?? ""),
      action,
    });
    return ok(data, getRequestIds(req));
  }

  @Get(":incidentId/narrative")
  @RequirePermission("rms.neris.incident.view")
  async getNarrative(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.incidents.getNarrative(tenantId, incidentId), getRequestIds(req));
  }

  @Patch(":incidentId/narrative")
  @RequirePermission("rms.neris.incident.edit")
  async upsertNarrative(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "neris_incident");
    const data = await this.incidents.upsertNarrative(
      tenantId,
      incidentId,
      body,
      principal,
      expected,
    );
    if (data && "recordVersion" in data && data.recordVersion) {
      setETag(res, data.recordVersion);
    }
    return ok(data, getRequestIds(req));
  }

  @Get(":incidentId/status-history")
  @RequireAnyPermission(["rms.neris.audit.view", "rms.neris.specialty.review"])
  async statusHistory(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.incidents.listStatusHistory(tenantId, incidentId), getRequestIds(req));
  }

  @Get(":incidentId/review-comments")
  @RequireAnyPermission(["rms.neris.incident.review", "rms.neris.specialty.review"])
  async reviewComments(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.incidents.listReviewComments(tenantId, incidentId), getRequestIds(req));
  }

  @Post(":incidentId/review-comments")
  @RequireAnyPermission(["rms.neris.incident.review", "rms.neris.specialty.review"])
  async addReviewComment(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.incidents.addReviewComment(tenantId, incidentId, body, principal),
      getRequestIds(req),
    );
  }

  @Post(":incidentId/review-comments/:commentId/resolve")
  @RequireAnyPermission(["rms.neris.incident.review", "rms.neris.specialty.review"])
  async resolveReviewComment(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("commentId") commentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.incidents.resolveReviewComment(tenantId, incidentId, commentId, body, principal),
      getRequestIds(req),
    );
  }

  @Post(":incidentId/review-comments/:commentId/reopen")
  @RequireAnyPermission(["rms.neris.incident.review", "rms.neris.specialty.review"])
  async reopenReviewComment(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("commentId") commentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.incidents.reopenReviewComment(tenantId, incidentId, commentId, body, principal),
      getRequestIds(req),
    );
  }

  @Get(":incidentId/schema-snapshot")
  @RequirePermission("rms.neris.incident.view")
  async schemaSnapshot(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.incidents.getSchemaSnapshot(tenantId, incidentId), getRequestIds(req));
  }

  @Get(":incidentId/configuration-snapshots")
  @RequirePermission("rms.neris.configuration.view")
  async configurationSnapshots(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.incidents.listConfigurationSnapshots(tenantId, incidentId),
      getRequestIds(req),
    );
  }

  @Get(":incidentId/validation-runs")
  @RequirePermission("rms.neris.validation.view")
  async validationRuns(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.incidents.listValidationRuns(tenantId, incidentId), getRequestIds(req));
  }

  @Get(":incidentId/validation-runs/:runId")
  @RequirePermission("rms.neris.validation.view")
  async validationRun(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("runId") runId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.incidents.getValidationRun(tenantId, incidentId, runId),
      getRequestIds(req),
    );
  }

  @Get(":incidentId/units")
  @RequirePermission("rms.neris.incident.view")
  async listUnits(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.assignments.listUnits(tenantId, incidentId), getRequestIds(req));
  }

  @Post(":incidentId/units")
  @RequirePermission("rms.neris.incident.edit")
  async createUnit(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.assignments.createUnit(tenantId, incidentId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":incidentId/units/:assignmentId")
  @RequirePermission("rms.neris.incident.edit")
  async patchUnit(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "neris_incident_unit");
    const data = await this.assignments.patchUnit(
      tenantId,
      incidentId,
      assignmentId,
      body,
      principal,
      expected,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Delete(":incidentId/units/:assignmentId")
  @RequirePermission("rms.neris.incident.edit")
  async deleteUnit(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("assignmentId") assignmentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const expected = requireIfMatch(req, "neris_incident_unit");
    return ok(
      await this.assignments.deleteUnit(tenantId, incidentId, assignmentId, principal, expected),
      getRequestIds(req),
    );
  }

  @Get(":incidentId/personnel")
  @RequirePermission("rms.neris.incident.view")
  async listPersonnel(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.assignments.listPersonnel(tenantId, incidentId), getRequestIds(req));
  }

  @Post(":incidentId/personnel")
  @RequirePermission("rms.neris.incident.edit")
  async createPersonnel(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.assignments.createPersonnel(tenantId, incidentId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":incidentId/personnel/:assignmentId")
  @RequirePermission("rms.neris.incident.edit")
  async patchPersonnel(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "neris_incident_personnel");
    const data = await this.assignments.patchPersonnel(
      tenantId,
      incidentId,
      assignmentId,
      body,
      principal,
      expected,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Delete(":incidentId/personnel/:assignmentId")
  @RequirePermission("rms.neris.incident.edit")
  async deletePersonnel(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("assignmentId") assignmentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const expected = requireIfMatch(req, "neris_incident_personnel");
    return ok(
      await this.assignments.deletePersonnel(
        tenantId,
        incidentId,
        assignmentId,
        principal,
        expected,
      ),
      getRequestIds(req),
    );
  }

  @Get(":incidentId/prefill")
  @RequirePermission("rms.neris.incident.view")
  async prefill(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Query() query: Record<string, string>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.assignments.getPrefill(tenantId, incidentId, query), getRequestIds(req));
  }
}
