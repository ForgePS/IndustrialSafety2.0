import { Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ForgeError } from "@forge/errors";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { AuditService } from "./audit.service.js";

@Controller("api/v1/tenants/:tenantId/audit-events")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequireAnyPermission(["platform.audit.read", "rms.neris.audit.view"])
  async list(
    @Param("tenantId") tenantId: string,
    @Query("page") pageRaw: string | undefined,
    @Query("pageSize") pageSizeRaw: string | undefined,
    @Query("actorUserId") actorUserIdRaw: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const page = Math.max(1, Number(pageRaw ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(pageSizeRaw ?? 25) || 25));
    const actorUserId = typeof actorUserIdRaw === "string" ? actorUserIdRaw.trim() : "";
    const { rows, total } = await this.audit.list(tenantId, page, pageSize, {
      ...(actorUserId ? { actorUserId } : {}),
    });
    return ok(rows, getRequestIds(req), {
      page,
      pageSize,
      total,
    });
  }

  @Post("export")
  @RequirePermission("platform.audit.export")
  async export(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    const payload = await this.audit.exportWithSelfAudit(tenantId, principal, ids);
    return ok(payload, ids);
  }

  @Get(":auditEventId")
  @RequireAnyPermission(["platform.audit.read", "rms.neris.audit.view"])
  async get(
    @Param("tenantId") tenantId: string,
    @Param("auditEventId") auditEventId: string,
    @Req() req: RequestWithIds,
  ) {
    const row = await this.audit.getById(tenantId, auditEventId);
    if (!row) {
      throw new ForgeError("NOT_FOUND", "Audit event not found");
    }
    return ok(row, getRequestIds(req));
  }
}
