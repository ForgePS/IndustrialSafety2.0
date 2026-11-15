import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { SearchService } from "./search.service.js";

/**
 * Authenticated search façade. Providers apply permission checks before mapping hits.
 * No coarse RequirePermission — denied providers simply omit groups (no lock teasers).
 */
@Controller("api/v1/tenants/:tenantId/search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Param("tenantId") tenantId: string,
    @Query("q") q: string | undefined,
    @Query("types") typesRaw: string | undefined,
    @Query("limitPerType") limitRaw: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const types = typesRaw
      ? typesRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    const limitPerType = limitRaw ? Number(limitRaw) : undefined;
    const data = await this.searchService.search(
      tenantId,
      {
        q: q ?? "",
        ...(types ? { types } : {}),
        ...(limitPerType && Number.isFinite(limitPerType) ? { limitPerType } : {}),
      },
      principal,
    );
    return ok(data, getRequestIds(req));
  }
}
