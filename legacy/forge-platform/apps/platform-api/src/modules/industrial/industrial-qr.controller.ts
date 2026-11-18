import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialQrService } from "./industrial-qr.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
type ListQuery = Record<string, string | undefined>;

const QR_VIEW = [
  "industrial.qr.view",
  "industrial.qr_links.view",
  "industrial.scan.view",
  "industrial.admin",
  "industrial.access",
] as const;

const QR_MANAGE = [
  "industrial.qr.manage",
  "industrial.qr.generate",
  "industrial.qr.replace",
  "industrial.qr.deactivate",
  "industrial.qr_links.manage",
  "industrial.scan.manage",
  "industrial.admin",
] as const;

const QR_SCAN = [
  "industrial.qr.scan",
  "industrial.scan.manage",
  "industrial.qr.manage",
  "industrial.admin",
] as const;

const QR_AUDIT = [
  "industrial.qr.audit.view",
  "industrial.qr.view",
  "industrial.qr_links.view",
  "industrial.admin",
] as const;

/**
 * QR link management routes. Registered on both legacy `/api/v1/qr-links` and
 * `/api/v1/industrial/qr-links` paths for industrial-web compatibility.
 */
@Controller(["api/v1/qr-links", "api/v1/industrial/qr-links"])
export class IndustrialQrController {
  constructor(private readonly qr: IndustrialQrService) {}

  private listOk(
    data: { items: unknown[]; page: number; pageSize: number; total?: number },
    req: RequestWithIds,
  ) {
    return ok(data, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total ?? data.items.length,
    });
  }

  @Get()
  @RequireAnyPermission([...QR_VIEW], { requiresEntitlement: ENTITLEMENT })
  async list(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.qr.listQrLinks(principal, query), req);
  }

  /** Static path kept off `:id` so Nest cannot treat "analytics" as a link id. */
  @Get("analytics/summary")
  @RequireAnyPermission(
    [
      "industrial.qr.analytics.view",
      "industrial.qr.view",
      "industrial.qr_links.view",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async analytics(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.analyticsSummary(principal, query ?? {}), getRequestIds(req));
  }

  /** Alias for older clients that called `/analytics`. */
  @Get("analytics")
  @RequireAnyPermission(
    [
      "industrial.qr.analytics.view",
      "industrial.qr.view",
      "industrial.qr_links.view",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async analyticsAlias(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.analytics(principal, query, req);
  }

  @Post()
  @RequireAnyPermission([...QR_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async create(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.createQrLink(principal, body ?? {}), getRequestIds(req));
  }

  @Get(":id")
  @RequireAnyPermission([...QR_VIEW], { requiresEntitlement: ENTITLEMENT })
  async getOne(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.getQrLink(principal, id), getRequestIds(req));
  }

  @Patch(":id")
  @RequireAnyPermission([...QR_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async update(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.updateQrLink(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post(":id/issue-token")
  @RequireAnyPermission([...QR_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async issueToken(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.issueToken(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post(":id/revoke-token")
  @RequireAnyPermission([...QR_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async revokeToken(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.revokeToken(principal, id), getRequestIds(req));
  }

  @Post(":id/replace")
  @RequireAnyPermission([...QR_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async replace(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.replaceQrLink(principal, id, body ?? {}), getRequestIds(req));
  }

  @Post(":id/deactivate")
  @RequireAnyPermission([...QR_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async deactivate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.deactivate(principal, id), getRequestIds(req));
  }

  @Post(":id/reactivate")
  @RequireAnyPermission([...QR_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async reactivate(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.reactivate(principal, id), getRequestIds(req));
  }

  @Post(":id/scan-events")
  @RequireAnyPermission([...QR_SCAN], { requiresEntitlement: ENTITLEMENT })
  async recordScan(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.recordScanEvent(principal, id, body ?? {}), getRequestIds(req));
  }

  @Get(":id/scan-events")
  @RequireAnyPermission([...QR_VIEW], { requiresEntitlement: ENTITLEMENT })
  async listScanEvents(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.qr.listScanEvents(principal, id, query), req);
  }

  @Get(":id/audit-events")
  @RequireAnyPermission([...QR_AUDIT], { requiresEntitlement: ENTITLEMENT })
  async listAuditEvents(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.qr.listAuditEvents(principal, id, query), req);
  }

  @Post(":id/qr-image")
  @RequireAnyPermission([...QR_MANAGE], { requiresEntitlement: ENTITLEMENT })
  async qrImage(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.qr.qrImage(principal, id, body ?? {}), getRequestIds(req));
  }
}
