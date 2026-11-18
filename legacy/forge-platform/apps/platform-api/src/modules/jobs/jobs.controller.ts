import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { JobsService } from "./jobs.service.js";

@Controller("api/v1/tenants/:tenantId/jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @RequirePermission("platform.jobs.read")
  async list(
    @Param("tenantId") tenantId: string,
    @Query("type") type: string | undefined,
    @Query("status") status: string | undefined,
    @Query("limit") limitRaw: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const data = await this.jobs.list(
      tenantId,
      {
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
        ...(limit && Number.isFinite(limit) ? { limit } : {}),
      },
      principal,
    );
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Get(":jobId")
  @RequirePermission("platform.jobs.read")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.jobs.get(tenantId, jobId, principal), getRequestIds(req));
  }
}
