import { Controller, Get, Param, Post, Body, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { ExportsService } from "./exports.service.js";

@Controller("api/v1/tenants/:tenantId/exports")
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  @RequirePermission("tenant.export.create")
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.exports.create(tenantId, body, principal), getRequestIds(req));
  }

  @Post(":jobId/download")
  @RequirePermission("tenant.export.read")
  async download(
    @Param("tenantId") tenantId: string,
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.exports.createDownload(tenantId, jobId, principal), getRequestIds(req));
  }

  @Get(":jobId/content")
  @RequirePermission("tenant.export.read")
  async content(
    @Param("tenantId") tenantId: string,
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Res() res: Response,
  ) {
    const file = await this.exports.getInlineContent(tenantId, jobId, principal);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.status(200).send(file.body);
  }
}
