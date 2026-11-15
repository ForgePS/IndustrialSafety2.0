import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { CompanyDocumentsService } from "./company-documents.service.js";

const COMPANY_DOCUMENTS_WRITE = [
  "platform.configuration.update",
  "tenant.configuration.update",
] as const;

@Controller("api/v1/tenants/:tenantId/company-documents")
export class CompanyDocumentsController {
  constructor(private readonly documents: CompanyDocumentsService) {}

  @Get()
  @RequireAnyPermission([...COMPANY_DOCUMENTS_WRITE], { allowWhenSuspended: true })
  async list(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.documents.list(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("upload-url")
  @RequireAnyPermission([...COMPANY_DOCUMENTS_WRITE], { allowWhenSuspended: true })
  @Idempotent({ resourceType: "company_document" })
  async createUploadUrl(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.documents.createUploadUrl(tenantId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Post(":id/complete")
  @RequireAnyPermission([...COMPANY_DOCUMENTS_WRITE], { allowWhenSuspended: true })
  @Idempotent({ resourceType: "company_document_complete" })
  async completeUpload(
    @Param("tenantId") tenantId: string,
    @Param("id") id: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.documents.completeUpload(tenantId, id, principal);
    return ok(data, getRequestIds(req));
  }

  @Get(":id/download-url")
  @RequireAnyPermission([...COMPANY_DOCUMENTS_WRITE], { allowWhenSuspended: true })
  async createDownloadUrl(
    @Param("tenantId") tenantId: string,
    @Param("id") id: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.documents.createDownloadUrl(tenantId, id, principal);
    return ok(data, getRequestIds(req));
  }

  @Delete(":id")
  @RequireAnyPermission([...COMPANY_DOCUMENTS_WRITE], { allowWhenSuspended: true })
  async archive(
    @Param("tenantId") tenantId: string,
    @Param("id") id: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.documents.archive(tenantId, id, principal);
    return ok(data, getRequestIds(req));
  }
}
