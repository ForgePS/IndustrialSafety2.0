import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { CadConnectionsService } from "./cad-connections.service.js";

@Controller()
export class CadConnectionsController {
  constructor(private readonly connections: CadConnectionsService) {}

  @Get("api/v1/tenants/:tenantId/cad/operations/summary")
  @RequirePermission("rms.cad.operations.view")
  async operationsSummary(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.connections.operationsSummary(tenantId), getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/cad/connections")
  @RequirePermission("rms.cad.connection.view")
  async list(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.connections.list(tenantId), getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/cad/connections/:connectionId")
  @RequirePermission("rms.cad.connection.view")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("connectionId") connectionId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.connections.get(tenantId, connectionId), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/cad/connections")
  @RequirePermission("rms.cad.connection.manage")
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.connections.create(tenantId, body, principal), getRequestIds(req));
  }

  @Patch("api/v1/tenants/:tenantId/cad/connections/:connectionId")
  @RequirePermission("rms.cad.connection.manage")
  async patch(
    @Param("tenantId") tenantId: string,
    @Param("connectionId") connectionId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.connections.patch(tenantId, connectionId, body, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/cad/connections/:connectionId/enable")
  @RequirePermission("rms.cad.connection.enable")
  async enable(
    @Param("tenantId") tenantId: string,
    @Param("connectionId") connectionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.connections.enable(tenantId, connectionId, principal), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/cad/connections/:connectionId/disable")
  @RequirePermission("rms.cad.connection.disable")
  async disable(
    @Param("tenantId") tenantId: string,
    @Param("connectionId") connectionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.connections.disable(tenantId, connectionId, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/cad/connections/:connectionId/test")
  @RequirePermission("rms.cad.connection.test")
  async test(
    @Param("tenantId") tenantId: string,
    @Param("connectionId") connectionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.connections.test(tenantId, connectionId, principal), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/cad/connections/:connectionId/rotate-secret")
  @RequirePermission("rms.cad.connection.rotate_secret")
  async rotateSecret(
    @Param("tenantId") tenantId: string,
    @Param("connectionId") connectionId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.connections.rotateSecret(tenantId, connectionId, body, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/cad/messages")
  @RequirePermission("rms.cad.message.view")
  async listMessages(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.connections.listMessages(tenantId), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/cad/messages/:rawMessageId/reprocess")
  @RequirePermission("rms.cad.message.reprocess")
  async reprocessMessage(
    @Param("tenantId") tenantId: string,
    @Param("rawMessageId") rawMessageId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.connections.reprocessMessage(tenantId, rawMessageId, body, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/cad/messages/replay")
  @RequirePermission("rms.cad.replay")
  async replayMessages(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.connections.replayMessages(tenantId, body, principal), getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/cad/unmapped-values")
  @RequirePermission("rms.cad.unmapped.view")
  async listUnmapped(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.connections.listUnmapped(tenantId), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/cad/unmapped-values/:unmappedId/resolve")
  @RequirePermission("rms.cad.unmapped.resolve")
  async resolveUnmapped(
    @Param("tenantId") tenantId: string,
    @Param("unmappedId") unmappedId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.connections.resolveUnmapped(tenantId, unmappedId, body, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/cad/unknown-units")
  @RequirePermission("rms.cad.unit_mapping.view")
  async listUnknownUnits(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.connections.listUnknownUnits(tenantId), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/cad/unknown-units/:unknownId/resolve")
  @RequirePermission("rms.cad.unit_mapping.manage")
  async resolveUnknownUnit(
    @Param("tenantId") tenantId: string,
    @Param("unknownId") unknownId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.connections.resolveUnknownUnit(tenantId, unknownId, body, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/cad/unknown-personnel")
  @RequirePermission("rms.cad.personnel_mapping.view")
  async listUnknownPersonnel(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.connections.listUnknownPersonnel(tenantId), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/cad/unknown-personnel/:unknownId/resolve")
  @RequirePermission("rms.cad.personnel_mapping.manage")
  async resolveUnknownPersonnel(
    @Param("tenantId") tenantId: string,
    @Param("unknownId") unknownId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.connections.resolveUnknownPersonnel(tenantId, unknownId, body, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/cad/unit-mappings")
  @RequirePermission("rms.cad.unit_mapping.view")
  async listUnitMappings(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.connections.listUnitMappings(tenantId), getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/cad/personnel-mappings")
  @RequirePermission("rms.cad.personnel_mapping.view")
  async listPersonnelMappings(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.connections.listPersonnelMappings(tenantId), getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/neris/incidents/:incidentId/cad-status")
  @RequirePermission("rms.cad.view")
  async incidentCadStatus(
    @Param("tenantId") tenantId: string,
    @Param("incidentId") incidentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.connections.incidentCadStatus(tenantId, incidentId), getRequestIds(req));
  }
}
