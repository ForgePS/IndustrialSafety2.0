import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialDocumentControlService } from "./industrial-document-control.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
const VIEW = [
  "industrial.documents.view",
  "industrial.documents.manage",
  "industrial.documents.approve",
  "industrial.documents.acknowledge",
  "industrial.admin",
  "industrial.access",
] as const;
const MANAGE = ["industrial.documents.manage", "industrial.admin"] as const;
const APPROVE = [
  "industrial.documents.approve",
  "industrial.documents.manage",
  "industrial.admin",
] as const;
const ACK = [
  "industrial.documents.acknowledge",
  "industrial.documents.view",
  "industrial.documents.manage",
  "industrial.admin",
  "industrial.access",
] as const;

type ListQuery = Record<string, string | undefined>;

/**
 * Document Control QMS under /api/v1/industrial/documents.
 * Registered before IndustrialFlatController catch-alls.
 */
@Controller("api/v1/industrial/documents")
export class IndustrialDocumentControlController {
  constructor(private readonly documents: IndustrialDocumentControlService) {}

  @Get()
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async list(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.documents.list(principal, query);
    return ok(data, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("approvals")
  @RequireAnyPermission([...APPROVE], { requiresEntitlement: ENTITLEMENT })
  async approvals(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.documents.listApprovalsQueue(principal), getRequestIds(req));
  }

  @Get("reviews/overdue")
  @RequireAnyPermission([...MANAGE, "industrial.documents.approve"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async overdueReviews(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.documents.listOverdueReviews(principal), getRequestIds(req));
  }

  @Get("acknowledgments/me")
  @RequireAnyPermission([...ACK], { requiresEntitlement: ENTITLEMENT })
  async myAcks(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.documents.myPendingAcknowledgments(principal), getRequestIds(req));
  }

  @Post("acknowledgments")
  @RequireAnyPermission([...ACK], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_document_acknowledgment" })
  async acknowledge(
    @Principal() principal: ForgePrincipal,
    @Body() body: { versionIds?: string[] },
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.documents.acknowledge(principal, body.versionIds ?? []),
      getRequestIds(req),
    );
  }

  @Post()
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_document" })
  async create(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.create(principal, body), getRequestIds(req));
  }

  @Get("folders")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async listFolders(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.documents.listFolders(principal), getRequestIds(req));
  }

  @Post("folders")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_document_folder" })
  async createFolder(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.createFolder(principal, body), getRequestIds(req));
  }

  /** Rename a folder by name: `{ name, newName }`. Documents in it move to the new name. */
  @Post("folders/rename")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async renameFolder(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.renameFolder(principal, body), getRequestIds(req));
  }

  /** Delete a folder by name: `{ name }`. Its documents are kept and moved out of it. */
  @Post("folders/delete")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async deleteFolderByName(
    @Principal() principal: ForgePrincipal,
    @Body() body: { name?: unknown },
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.deleteFolderByName(principal, body.name), getRequestIds(req));
  }

  @Delete("folders/:folderId")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async deleteFolder(
    @Principal() principal: ForgePrincipal,
    @Param("folderId") folderId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.deleteFolder(principal, folderId), getRequestIds(req));
  }

  @Get(":id")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async get(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.getById(principal, id), getRequestIds(req));
  }

  @Patch(":id")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async update(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.update(principal, id, body), getRequestIds(req));
  }

  @Post(":id/archive")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async archive(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.archive(principal, id), getRequestIds(req));
  }

  @Post(":id/obsolete")
  @RequireAnyPermission([...APPROVE], { requiresEntitlement: ENTITLEMENT })
  async obsolete(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.obsolete(principal, id), getRequestIds(req));
  }

  @Put(":id/distributions")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async distributions(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: { distributions?: Array<{ scopeType: string; scopeId?: string | null }> },
    @Req() req: RequestWithIds,
  ) {
    await this.documents.replaceDistributions(principal, id, body);
    return ok(await this.documents.getById(principal, id), getRequestIds(req));
  }

  @Get(":id/acknowledgments")
  @RequireAnyPermission([...MANAGE, "industrial.documents.approve"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async docAcks(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.listDocumentAcknowledgments(principal, id), getRequestIds(req));
  }

  @Post(":id/versions/upload-url")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "platform_document_version" })
  async uploadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.documents.createVersionUploadUrl(principal, id, body), getRequestIds(req));
  }

  @Post(":id/versions/:versionId/complete")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async complete(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.documents.completeVersionUpload(principal, id, versionId),
      getRequestIds(req),
    );
  }

  @Get(":id/versions/:versionId/download-url")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async download(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Req() req: RequestWithIds,
  ) {
    const canManage =
      principal.permissions.has("industrial.documents.manage") ||
      principal.permissions.has("industrial.admin");
    return ok(
      await this.documents.downloadUrl(principal, id, versionId, canManage),
      getRequestIds(req),
    );
  }

  @Post(":id/versions/:versionId/submit-review")
  @RequireAnyPermission([...MANAGE], { requiresEntitlement: ENTITLEMENT })
  async submit(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Req() req: RequestWithIds,
  ) {
    await this.documents.submitReview(principal, id, versionId);
    return ok(await this.documents.getById(principal, id), getRequestIds(req));
  }

  @Post(":id/versions/:versionId/approve")
  @RequireAnyPermission([...APPROVE], { requiresEntitlement: ENTITLEMENT })
  async approve(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Req() req: RequestWithIds,
  ) {
    await this.documents.approve(principal, id, versionId);
    return ok(await this.documents.getById(principal, id), getRequestIds(req));
  }

  @Post(":id/versions/:versionId/reject")
  @RequireAnyPermission([...APPROVE], { requiresEntitlement: ENTITLEMENT })
  async reject(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Req() req: RequestWithIds,
  ) {
    await this.documents.reject(principal, id, versionId);
    return ok(await this.documents.getById(principal, id), getRequestIds(req));
  }
}
