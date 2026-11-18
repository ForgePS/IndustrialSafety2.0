import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { ConfigurationService } from "./configuration.service.js";

@Controller()
export class ConfigurationController {
  constructor(private readonly configuration: ConfigurationService) {}

  @Get("api/v1/tenants/:tenantId/configuration")
  @RequirePermission("platform.configuration.update")
  async listAll(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.configuration.listAll(tenantId), getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/configuration/:namespace")
  @RequirePermission("platform.configuration.update")
  async listNamespace(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.configuration.listNamespace(tenantId, namespace), getRequestIds(req));
  }

  @Put("api/v1/tenants/:tenantId/configuration/:namespace/:key")
  @RequirePermission("platform.configuration.update")
  @Idempotent({ resourceType: "configuration" })
  async put(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("key") key: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.configuration.put(tenantId, namespace, key, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get("api/v1/config/catalog")
  @RequireAnyPermission([
    "platform.configuration.update",
    "tenant.configuration.update",
    "platform.configuration.publish",
    "tenant.configuration.publish",
    "platform.audit.read",
  ])
  catalog(@Req() req: RequestWithIds) {
    return ok(this.configuration.listCatalog(), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/config/ensure-defaults")
  @RequireAnyPermission(["platform.configuration.update", "tenant.configuration.update"])
  async ensureDefaults(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.configuration.ensureDefaults(tenantId, principal), getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/config/:namespace")
  @RequireAnyPermission([
    "platform.configuration.update",
    "tenant.configuration.update",
    "platform.configuration.publish",
    "tenant.configuration.publish",
    "platform.audit.read",
  ])
  async listStudio(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.listStudioObjects(tenantId, namespace, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/config/:namespace")
  @RequireAnyPermission(["platform.configuration.update", "tenant.configuration.update"])
  @Idempotent({ resourceType: "config_draft" })
  async createDraft(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.createDraft(tenantId, namespace, body, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/config/:namespace/:objectKey/versions")
  @RequireAnyPermission([
    "platform.configuration.update",
    "tenant.configuration.update",
    "platform.configuration.publish",
    "tenant.configuration.publish",
    "platform.audit.read",
  ])
  async listVersions(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("objectKey") objectKey: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.listVersions(tenantId, namespace, objectKey, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/config/:namespace/:objectKey/versions/:versionId")
  @RequireAnyPermission([
    "platform.configuration.update",
    "tenant.configuration.update",
    "platform.configuration.publish",
    "tenant.configuration.publish",
    "platform.audit.read",
  ])
  async getVersion(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("objectKey") objectKey: string,
    @Param("versionId") versionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.getVersion(tenantId, namespace, objectKey, versionId, principal),
      getRequestIds(req),
    );
  }

  @Patch("api/v1/tenants/:tenantId/config/:namespace/:objectKey/versions/:versionId")
  @RequireAnyPermission(["platform.configuration.update", "tenant.configuration.update"])
  async patchDraft(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("objectKey") objectKey: string,
    @Param("versionId") versionId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.patchDraft(
        tenantId,
        namespace,
        objectKey,
        versionId,
        body,
        principal,
      ),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/config/:namespace/:objectKey/versions/:versionId/publish")
  @RequireAnyPermission(["platform.configuration.publish", "tenant.configuration.publish"])
  async publish(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("objectKey") objectKey: string,
    @Param("versionId") versionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.publish(tenantId, namespace, objectKey, versionId, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/config/:namespace/:objectKey/versions/:versionId/schedule")
  @RequireAnyPermission(["platform.configuration.publish", "tenant.configuration.publish"])
  async schedule(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("objectKey") objectKey: string,
    @Param("versionId") versionId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.schedule(tenantId, namespace, objectKey, versionId, body, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/config/:namespace/:objectKey/versions/:versionId/archive")
  @RequireAnyPermission(["platform.configuration.publish", "tenant.configuration.publish"])
  async archive(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("objectKey") objectKey: string,
    @Param("versionId") versionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.archive(tenantId, namespace, objectKey, versionId, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/tenants/:tenantId/config/:namespace/:objectKey/versions/:versionId/rollback")
  @RequireAnyPermission(["platform.configuration.publish", "tenant.configuration.publish"])
  async rollback(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("objectKey") objectKey: string,
    @Param("versionId") versionId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.rollback(tenantId, namespace, objectKey, versionId, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/config/:namespace/:objectKey/compare")
  @RequireAnyPermission([
    "platform.configuration.update",
    "tenant.configuration.update",
    "platform.configuration.publish",
    "tenant.configuration.publish",
    "platform.audit.read",
  ])
  async compare(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("objectKey") objectKey: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.compare(tenantId, namespace, objectKey, from, to, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/config/:namespace/:objectKey/effective")
  async effective(
    @Param("tenantId") tenantId: string,
    @Param("namespace") namespace: string,
    @Param("objectKey") objectKey: string,
    @Query("at") at: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.configuration.effective(tenantId, namespace, objectKey, at, principal),
      getRequestIds(req),
    );
  }

  @Get("api/v1/tenants/:tenantId/config-export")
  @RequireAnyPermission(["platform.configuration.update", "tenant.configuration.update"])
  async exportBundle(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.configuration.exportBundle(tenantId, principal), getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/config-import")
  @RequireAnyPermission(["platform.configuration.update", "tenant.configuration.update"])
  async importBundle(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Query("dryRun") dryRunQuery: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const dryRun =
      dryRunQuery === "1" ||
      dryRunQuery === "true" ||
      (typeof body === "object" &&
        body !== null &&
        "dryRun" in body &&
        Boolean((body as { dryRun?: unknown }).dryRun));
    return ok(
      await this.configuration.importBundle(tenantId, body, principal, { dryRun }),
      getRequestIds(req),
    );
  }
}
