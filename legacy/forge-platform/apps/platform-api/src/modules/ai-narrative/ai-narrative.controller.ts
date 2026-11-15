import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { AiNarrativeService } from "./ai-narrative.service.js";

@Controller()
export class AiNarrativeController {
  constructor(private readonly narratives: AiNarrativeService) {}

  @Post("api/v1/ai/narratives")
  @RequireAnyPermission(["ai.narrative.generate", "rms.incident.ai_narrative.generate"])
  async create(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.narratives.create(principal.tenantId, principal, body, ids.correlationId),
      ids,
    );
  }

  @Get("api/v1/ai/narratives/:requestId")
  @RequirePermission("ai.narrative.use")
  async get(
    @Param("requestId") requestId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.narratives.get(principal.tenantId, requestId, principal, ids.correlationId),
      ids,
    );
  }

  @Post("api/v1/ai/narratives/:requestId/regenerate")
  @RequireAnyPermission([
    "ai.narrative.generate",
    "ai.narrative.rewrite",
    "rms.incident.ai_narrative.generate",
  ])
  async regenerate(
    @Param("requestId") requestId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.narratives.regenerate(principal.tenantId, requestId, principal, ids.correlationId),
      ids,
    );
  }

  @Post("api/v1/ai/narratives/:requestId/accept")
  @RequireAnyPermission(["ai.narrative.accept", "rms.incident.ai_narrative.accept"])
  async accept(
    @Param("requestId") requestId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.narratives.accept(
        principal.tenantId,
        requestId,
        principal,
        body,
        ids.correlationId,
      ),
      ids,
    );
  }

  @Post("api/v1/ai/narratives/:requestId/partial-accept")
  @RequireAnyPermission(["ai.narrative.accept", "rms.incident.ai_narrative.accept"])
  async partialAccept(
    @Param("requestId") requestId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    const payload =
      body && typeof body === "object"
        ? { ...(body as Record<string, unknown>), mode: "PARTIAL" }
        : { mode: "PARTIAL" };
    return ok(
      await this.narratives.accept(
        principal.tenantId,
        requestId,
        principal,
        payload,
        ids.correlationId,
      ),
      ids,
    );
  }

  @Post("api/v1/ai/narratives/:requestId/reject")
  @RequirePermission("ai.narrative.reject")
  async reject(
    @Param("requestId") requestId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.narratives.reject(
        principal.tenantId,
        requestId,
        principal,
        body,
        ids.correlationId,
      ),
      ids,
    );
  }

  @Get("api/v1/ai/narratives/:requestId/history")
  @RequirePermission("ai.narrative.use")
  async history(
    @Param("requestId") requestId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.narratives.history(principal.tenantId, requestId, principal),
      getRequestIds(req),
    );
  }

  @Post("api/v1/ai/narratives/quality-check")
  @RequirePermission("ai.narrative.use")
  async qualityCheck(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.narratives.qualityCheck(principal.tenantId, principal, body),
      getRequestIds(req),
    );
  }

  @Get("api/v1/ai/usage")
  @RequireAnyPermission(["ai.narrative.view_usage", "platform.ai.usage.view"])
  async usage(
    @Query("tenantId") queryTenantId: string | undefined,
    @Query("limit") limitRaw: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    const parsedLimit = limitRaw ? Number(limitRaw) : NaN;
    return ok(
      await this.narratives.usage(
        tenantId,
        principal,
        Number.isFinite(parsedLimit) ? { limit: parsedLimit } : undefined,
      ),
      getRequestIds(req),
    );
  }

  @Get("api/v1/ai/policies")
  @RequireAnyPermission([
    "ai.narrative.configure",
    "platform.ai.policy.manage",
    "platform.ai.narrative.manage",
  ])
  async policies(
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(await this.narratives.listPolicies(tenantId, principal), getRequestIds(req));
  }

  @Patch("api/v1/ai/policies/:policyId")
  @RequireAnyPermission(["platform.ai.policy.manage", "platform.ai.narrative.manage"])
  async patchPolicy(
    @Param("policyId") policyId: string,
    @Body() body: unknown,
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(
      await this.narratives.patchPolicy(tenantId, principal, policyId, body, ids.correlationId),
      ids,
    );
  }

  @Get("api/v1/ai/templates")
  @RequireAnyPermission([
    "ai.narrative.use",
    "ai.narrative.manage_templates",
    "platform.ai.narrative.manage",
  ])
  async templates(
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(await this.narratives.listTemplates(tenantId, principal), getRequestIds(req));
  }

  @Post("api/v1/ai/templates")
  @RequireAnyPermission(["ai.narrative.manage_templates", "platform.ai.narrative.manage"])
  async createTemplate(
    @Body() body: unknown,
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(
      await this.narratives.createTemplate(tenantId, principal, body, ids.correlationId),
      ids,
    );
  }

  @Post("api/v1/ai/templates/:templateId/publish")
  @RequireAnyPermission(["ai.narrative.manage_templates", "platform.ai.narrative.manage"])
  async publishTemplate(
    @Param("templateId") templateId: string,
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(
      await this.narratives.publishTemplate(tenantId, principal, templateId, ids.correlationId),
      ids,
    );
  }

  @Get("api/v1/ai/models")
  @RequireAnyPermission([
    "platform.ai.narrative.manage",
    "platform.ai.provider.manage",
    "platform.ai.usage.view",
  ])
  async models(
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(await this.narratives.listModels(tenantId, principal), getRequestIds(req));
  }

  @Post("api/v1/ai/models")
  @RequireAnyPermission(["platform.ai.narrative.manage", "platform.ai.provider.manage"])
  async createModel(
    @Body() body: unknown,
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(
      await this.narratives.createModelPolicy(tenantId, principal, body, ids.correlationId),
      ids,
    );
  }

  @Patch("api/v1/ai/models/:modelPolicyId")
  @RequireAnyPermission(["platform.ai.narrative.manage", "platform.ai.provider.manage"])
  async patchModel(
    @Param("modelPolicyId") modelPolicyId: string,
    @Body() body: unknown,
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(
      await this.narratives.patchModelPolicy(
        tenantId,
        principal,
        modelPolicyId,
        body,
        ids.correlationId,
      ),
      ids,
    );
  }

  @Get("api/v1/ai/providers")
  @RequireAnyPermission([
    "platform.ai.narrative.manage",
    "platform.ai.provider.manage",
    "platform.ai.usage.view",
  ])
  async providers(
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(await this.narratives.listProviders(tenantId, principal), getRequestIds(req));
  }

  @Get("api/v1/ai/audit")
  @RequireAnyPermission([
    "ai.narrative.view_audit",
    "platform.ai.narrative.manage",
    "platform.ai.usage.view",
  ])
  async audit(
    @Query("tenantId") queryTenantId: string | undefined,
    @Query("limit") limitRaw: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    const parsedLimit = limitRaw ? Number(limitRaw) : NaN;
    return ok(
      await this.narratives.listAudit(
        tenantId,
        principal,
        Number.isFinite(parsedLimit) ? { limit: parsedLimit } : undefined,
      ),
      getRequestIds(req),
    );
  }

  @Get("api/v1/ai/management/overview")
  @RequireAnyPermission(["platform.ai.narrative.manage", "platform.ai.usage.view"])
  async managementOverview(
    @Query("tenantId") queryTenantId: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const tenantId = this.narratives.resolveManagementTenantId(principal, queryTenantId);
    return ok(await this.narratives.managementOverview(tenantId, principal), getRequestIds(req));
  }

  @Post("api/v1/ai/management/tenants/:tenantId/suspend")
  @RequireAnyPermission(["platform.ai.narrative.manage", "platform.ai.policy.manage"])
  async suspendTenant(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.narratives.suspendTenant(tenantId, principal, ids.correlationId), ids);
  }

  @Post("api/v1/ai/management/tenants/:tenantId/unsuspend")
  @RequireAnyPermission(["platform.ai.narrative.manage", "platform.ai.policy.manage"])
  async unsuspendTenant(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.narratives.unsuspendTenant(tenantId, principal, ids.correlationId), ids);
  }
}
