import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { IncidentAttachmentsService } from "./incident-attachments.service.js";
import { SpecialtyRecordsService } from "./specialty-records.service.js";

@Controller("api/v1/tenants/:tenantId/neris/incidents/:incidentId")
export class NerisSpecialtyController {
  constructor(
    private readonly specialty: SpecialtyRecordsService,
    private readonly attachments: IncidentAttachmentsService,
  ) {}

  // Exposures
  @Get("exposures")
  @RequirePermission("rms.neris.exposure.view")
  async listExposures(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Query("search") search: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.listExposures(tenantId, incidentId, principal, search),
      getRequestIds(req),
    );
  }

  @Post("exposures")
  @RequirePermission("rms.neris.exposure.edit")
  async createExposure(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.createExposure(tenantId, incidentId, body, principal);
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get("exposures/:exposureId")
  @RequirePermission("rms.neris.exposure.view")
  async getExposure(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("exposureId") exposureId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.getExposure(tenantId, incidentId, exposureId, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("exposures/:exposureId")
  @RequirePermission("rms.neris.exposure.edit")
  async patchExposure(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("exposureId") exposureId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.patchExposure(
      tenantId,
      incidentId,
      exposureId,
      body,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("exposures/:exposureId/archive")
  @RequirePermission("rms.neris.exposure.edit")
  async archiveExposure(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("exposureId") exposureId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.archiveExposure(
      tenantId,
      incidentId,
      exposureId,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("exposures/:exposureId/restore")
  @RequirePermission("rms.neris.exposure.edit")
  async restoreExposure(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("exposureId") exposureId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.restoreExposure(
      tenantId,
      incidentId,
      exposureId,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  // Civilian casualties
  @Get("civilian-casualties")
  @RequirePermission("rms.neris.civilian_casualty.view")
  async listCivilian(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Query("full") full: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.listCivilianCasualties(tenantId, incidentId, principal, {
        full: full === "true",
      }),
      getRequestIds(req),
    );
  }

  @Post("civilian-casualties")
  @RequirePermission("rms.neris.civilian_casualty.edit")
  async createCivilian(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.createCivilianCasualty(tenantId, incidentId, body, principal);
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get("civilian-casualties/:casualtyId")
  @RequirePermission("rms.neris.civilian_casualty.view")
  async getCivilian(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("casualtyId") casualtyId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.getCivilianCasualty(
      tenantId,
      incidentId,
      casualtyId,
      principal,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("civilian-casualties/:casualtyId")
  @RequirePermission("rms.neris.civilian_casualty.edit")
  async patchCivilian(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("casualtyId") casualtyId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.patchCivilianCasualty(
      tenantId,
      incidentId,
      casualtyId,
      body,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("civilian-casualties/:casualtyId/archive")
  @RequirePermission("rms.neris.civilian_casualty.edit")
  async archiveCivilian(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("casualtyId") casualtyId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.archiveCivilianCasualty(
      tenantId,
      incidentId,
      casualtyId,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  // Fire-service casualties
  @Get("fire-service-casualties")
  @RequirePermission("rms.neris.fire_service_casualty.view")
  async listFf(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Query("full") full: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.listFireServiceCasualties(tenantId, incidentId, principal, {
        full: full === "true",
      }),
      getRequestIds(req),
    );
  }

  @Post("fire-service-casualties")
  @RequirePermission("rms.neris.fire_service_casualty.edit")
  async createFf(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.createFireServiceCasualty(
      tenantId,
      incidentId,
      body,
      principal,
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get("fire-service-casualties/:casualtyId")
  @RequirePermission("rms.neris.fire_service_casualty.view")
  async getFf(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("casualtyId") casualtyId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.getFireServiceCasualty(
      tenantId,
      incidentId,
      casualtyId,
      principal,
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("fire-service-casualties/:casualtyId")
  @RequirePermission("rms.neris.fire_service_casualty.edit")
  async patchFf(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("casualtyId") casualtyId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.patchFireServiceCasualty(
      tenantId,
      incidentId,
      casualtyId,
      body,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("fire-service-casualties/:casualtyId/archive")
  @RequirePermission("rms.neris.fire_service_casualty.edit")
  async archiveFf(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("casualtyId") casualtyId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.archiveFireServiceCasualty(
      tenantId,
      incidentId,
      casualtyId,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  // Hazmat
  @Get("hazmat/substances")
  @RequirePermission("rms.neris.hazmat.view")
  async listSubstances(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.listHazmatSubstances(tenantId, incidentId, principal),
      getRequestIds(req),
    );
  }

  @Post("hazmat/substances")
  @RequirePermission("rms.neris.hazmat.edit")
  async createSubstance(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.createHazmatSubstance(tenantId, incidentId, body, principal);
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("hazmat/substances/:substanceId")
  @RequirePermission("rms.neris.hazmat.edit")
  async patchSubstance(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("substanceId") substanceId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.patchHazmatSubstance(
      tenantId,
      incidentId,
      substanceId,
      body,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("hazmat/substances/:substanceId/archive")
  @RequirePermission("rms.neris.hazmat.edit")
  async archiveSubstance(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("substanceId") substanceId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.archiveHazmatSubstance(
      tenantId,
      incidentId,
      substanceId,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get("hazmat/containers")
  @RequirePermission("rms.neris.hazmat.view")
  async listContainers(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.listHazmatContainers(tenantId, incidentId, principal),
      getRequestIds(req),
    );
  }

  @Post("hazmat/containers")
  @RequirePermission("rms.neris.hazmat.edit")
  async createContainer(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.createHazmatContainer(tenantId, incidentId, body, principal);
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("hazmat/containers/:containerId")
  @RequirePermission("rms.neris.hazmat.edit")
  async patchContainer(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("containerId") containerId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.patchHazmatContainer(
      tenantId,
      incidentId,
      containerId,
      body,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("hazmat/containers/:containerId/archive")
  @RequirePermission("rms.neris.hazmat.edit")
  async archiveContainer(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("containerId") containerId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.archiveHazmatContainer(
      tenantId,
      incidentId,
      containerId,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  // Alarm / protection
  @Get("alarm-systems")
  @RequirePermission("rms.neris.alarm_system.view")
  async listAlarms(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.listAlarmSystems(tenantId, incidentId, principal),
      getRequestIds(req),
    );
  }

  @Post("alarm-systems")
  @RequirePermission("rms.neris.alarm_system.edit")
  async createAlarm(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.createAlarmSystem(tenantId, incidentId, body, principal);
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("alarm-systems/:systemId")
  @RequirePermission("rms.neris.alarm_system.edit")
  async patchAlarm(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("systemId") systemId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.patchAlarmSystem(
      tenantId,
      incidentId,
      systemId,
      body,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("alarm-systems/:systemId/archive")
  @RequirePermission("rms.neris.alarm_system.edit")
  async archiveAlarm(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("systemId") systemId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.archiveAlarmSystem(
      tenantId,
      incidentId,
      systemId,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get("protection-systems")
  @RequirePermission("rms.neris.protection_system.view")
  async listProtection(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.listProtectionSystems(tenantId, incidentId, principal),
      getRequestIds(req),
    );
  }

  @Post("protection-systems")
  @RequirePermission("rms.neris.protection_system.edit")
  async createProtection(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.createProtectionSystem(tenantId, incidentId, body, principal);
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("protection-systems/:systemId")
  @RequirePermission("rms.neris.protection_system.edit")
  async patchProtection(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("systemId") systemId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.patchProtectionSystem(
      tenantId,
      incidentId,
      systemId,
      body,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("protection-systems/:systemId/archive")
  @RequirePermission("rms.neris.protection_system.edit")
  async archiveProtection(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("systemId") systemId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.specialty.archiveProtectionSystem(
      tenantId,
      incidentId,
      systemId,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data!.recordVersion);
    return ok(data, getRequestIds(req));
  }

  // Attachments
  @Get("attachments")
  @RequirePermission("rms.neris.attachments.view")
  async listAttachments(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.attachments.list(tenantId, incidentId, principal), getRequestIds(req));
  }

  @Post("attachments/uploads")
  @RequirePermission("rms.neris.attachments.upload")
  async initUpload(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.attachments.initializeUpload(tenantId, incidentId, body, principal),
      getRequestIds(req),
    );
  }

  @Post("attachments/:attachmentId/complete")
  @RequirePermission("rms.neris.attachments.upload")
  async completeUpload(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("attachmentId") attachmentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.attachments.completeUpload(tenantId, incidentId, attachmentId, body, principal),
      getRequestIds(req),
    );
  }

  @Get("attachments/:attachmentId")
  @RequirePermission("rms.neris.attachments.view")
  async getAttachment(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("attachmentId") attachmentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.attachments.get(tenantId, incidentId, attachmentId, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("attachments/:attachmentId")
  @RequirePermission("rms.neris.attachments.upload")
  async patchAttachment(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("attachmentId") attachmentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.attachments.patch(
      tenantId,
      incidentId,
      attachmentId,
      body,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("attachments/:attachmentId/archive")
  @RequirePermission("rms.neris.attachments.archive")
  async archiveAttachment(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Param("attachmentId") attachmentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.attachments.archive(
      tenantId,
      incidentId,
      attachmentId,
      principal,
      requireIfMatch(req, "neris_specialty_record"),
    );
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  // Occupancy / proposals / section approval
  @Get("occupancy-links")
  @RequirePermission("rms.neris.incident.view")
  async listOccupancyLinks(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.listOccupancyLinks(tenantId, incidentId, principal),
      getRequestIds(req),
    );
  }

  @Post("occupancy-links")
  @RequirePermission("rms.neris.incident.edit")
  async createOccupancyLink(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.createOccupancyLink(tenantId, incidentId, body, principal),
      getRequestIds(req),
    );
  }

  @Post("proposed-master-updates")
  @RequirePermission("rms.neris.incident.edit")
  async createProposal(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.createProposedMasterUpdate(tenantId, incidentId, body, principal),
      getRequestIds(req),
    );
  }

  @Post("section-approvals")
  @RequirePermission("rms.neris.specialty.review")
  async approveSection(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.approveSection(tenantId, incidentId, body, principal),
      getRequestIds(req),
    );
  }

  @Post("section-returns")
  @RequirePermission("rms.neris.specialty.review")
  async returnSection(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.returnSpecialtySection(tenantId, incidentId, body, principal),
      getRequestIds(req),
    );
  }
}

@Controller("api/v1/tenants/:tenantId/neris/proposed-master-updates")
export class NerisProposedMasterUpdatesController {
  constructor(private readonly specialty: SpecialtyRecordsService) {}

  @Patch(":proposalId")
  @RequirePermission("rms.masterdata.manage")
  async review(
    @Param("tenantId") tenantId: string,
    @Param("proposalId") proposalId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.specialty.reviewProposedMasterUpdate(tenantId, proposalId, body, principal),
      getRequestIds(req),
    );
  }
}
