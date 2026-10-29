import { Body, Controller, Get, Param, Post, Put, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { BrandingService } from "./branding.service.js";

const BRANDING_WRITE = ["platform.configuration.update", "tenant.configuration.update"] as const;

@Controller("api/v1/tenants/:tenantId/branding")
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  @RequireAnyPermission([...BRANDING_WRITE], { allowWhenSuspended: true })
  async get(
    @Param("tenantId") tenantId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.branding.get(tenantId);
    if (data) {
      setETag(res, data.recordVersion);
    }
    return ok(data, getRequestIds(req));
  }

  @Put()
  @RequireAnyPermission([...BRANDING_WRITE], { allowWhenSuspended: true })
  @Idempotent({ resourceType: "branding" })
  async put(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.branding.put(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("assets/upload-url")
  @RequireAnyPermission([...BRANDING_WRITE], { allowWhenSuspended: true })
  @Idempotent({ resourceType: "branding_asset" })
  async createUploadUrl(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.branding.createAssetUpload(tenantId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Get("assets/:documentId/download-url")
  @RequireAnyPermission([...BRANDING_WRITE], { allowWhenSuspended: true })
  async createDownloadUrl(
    @Param("tenantId") tenantId: string,
    @Param("documentId") documentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.branding.createAssetDownloadUrl(tenantId, documentId, principal);
    return ok(data, getRequestIds(req));
  }
}
