import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { PhotoMarkupService } from "./photo-markup.service.js";

const PHOTO_VIEW = [
  "industrial.photo_markup.view",
  "industrial.photo_markup.view_original",
  "industrial.photo_markup.view_history",
  "industrial.admin",
  "industrial.access",
] as const;

const PHOTO_WRITE = [
  "industrial.photo_markup.create",
  "industrial.photo_markup.edit",
  "industrial.admin",
] as const;

const PHOTO_RESTORE = ["industrial.photo_markup.restore", "industrial.admin"] as const;

@Controller("api/v1/photos")
export class PhotoMarkupController {
  constructor(private readonly photos: PhotoMarkupService) {}

  @Get(":photoId")
  @RequireAnyPermission([...PHOTO_VIEW])
  async getPhoto(
    @Param("photoId") photoId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.photos.getPhoto(principal, photoId);
    return ok(data, getRequestIds(req));
  }

  @Post()
  @RequireAnyPermission([...PHOTO_WRITE])
  @Idempotent({ resourceType: "forge_photo" })
  async createPhoto(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.photos.createPhoto(principal, body);
    return ok(data, getRequestIds(req));
  }

  @Get(":photoId/markup")
  @RequireAnyPermission([...PHOTO_VIEW])
  async getCurrentMarkup(
    @Param("photoId") photoId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.photos.getCurrentMarkup(principal, photoId);
    return ok(data, getRequestIds(req));
  }

  @Post(":photoId/markup")
  @RequireAnyPermission([...PHOTO_WRITE])
  @Idempotent({ resourceType: "photo_markup_revision" })
  async saveMarkup(
    @Param("photoId") photoId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.photos.saveMarkup(principal, photoId, body);
    return ok(data, getRequestIds(req));
  }

  @Get(":photoId/markup/revisions")
  @RequireAnyPermission([...PHOTO_VIEW])
  async listRevisions(
    @Param("photoId") photoId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.photos.listRevisions(principal, photoId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Get(":photoId/markup/revisions/:revisionId")
  @RequireAnyPermission([...PHOTO_VIEW])
  async getRevision(
    @Param("photoId") photoId: string,
    @Param("revisionId") revisionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.photos.getRevision(principal, photoId, revisionId);
    return ok(data, getRequestIds(req));
  }

  @Post(":photoId/markup/:revisionId/restore")
  @RequireAnyPermission([...PHOTO_RESTORE])
  @Idempotent({ resourceType: "photo_markup_restore" })
  async restoreRevision(
    @Param("photoId") photoId: string,
    @Param("revisionId") revisionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.photos.restoreRevision(principal, photoId, revisionId);
    return ok(data, getRequestIds(req));
  }

  @Post(":photoId/original/download-url")
  @RequireAnyPermission([...PHOTO_VIEW])
  async originalDownloadUrl(
    @Param("photoId") photoId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.photos.createOriginalDownloadUrl(principal, photoId);
    return ok(data, getRequestIds(req));
  }

  @Post(":photoId/markup/:revisionId/rendered/download-url")
  @RequireAnyPermission([...PHOTO_VIEW])
  async renderedDownloadUrl(
    @Param("photoId") photoId: string,
    @Param("revisionId") revisionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.photos.createRenderedDownloadUrl(principal, photoId, revisionId);
    return ok(data, getRequestIds(req));
  }
}
