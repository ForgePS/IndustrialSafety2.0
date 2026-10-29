import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { PersonsService } from "./persons.service.js";

@Controller("api/v1/tenants/:tenantId/persons")
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Post()
  @RequirePermission("platform.person.create")
  @Idempotent({ resourceType: "person" })
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.persons.create(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get()
  @RequirePermission("platform.person.read")
  async list(
    @Param("tenantId") tenantId: string,
    @Query("q") q: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.persons.list(tenantId, q);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("merge")
  @RequirePermission("platform.person.merge")
  @Idempotent({ resourceType: "person_merge" })
  async merge(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.persons.merge(tenantId, body, principal), getRequestIds(req));
  }

  @Get(":personId")
  @RequirePermission("platform.person.read")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("personId") personId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.persons.get(tenantId, personId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch(":personId")
  @RequirePermission("platform.person.update")
  async patch(
    @Param("tenantId") tenantId: string,
    @Param("personId") personId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "person");
    const data = await this.persons.patch(tenantId, personId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":personId/archive")
  @RequirePermission("platform.person.update")
  async archive(
    @Param("tenantId") tenantId: string,
    @Param("personId") personId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "person");
    const data = await this.persons.archive(tenantId, personId, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get(":personId/duplicate-candidates")
  @RequirePermission("platform.person.read")
  async duplicates(
    @Param("tenantId") tenantId: string,
    @Param("personId") personId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.persons.listDuplicateCandidates(tenantId, personId), getRequestIds(req));
  }

  @Post(":personId/sensitive-identifiers")
  @RequirePermission("platform.person.update")
  async putSensitive(
    @Param("tenantId") tenantId: string,
    @Param("personId") personId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.persons.putSensitiveIdentifier(tenantId, personId, body, principal),
      getRequestIds(req),
    );
  }

  @Get(":personId/sensitive-identifiers/:type")
  @RequirePermission("platform.sensitive_data.read")
  async getSensitive(
    @Param("tenantId") tenantId: string,
    @Param("personId") personId: string,
    @Param("type") type: string,
    @Query("reveal") reveal: string | undefined,
    @Query("reason") reason: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.persons.getSensitiveIdentifier(
        tenantId,
        personId,
        type,
        principal,
        reveal === "true" || reveal === "1",
        reason,
      ),
      getRequestIds(req),
    );
  }
}
