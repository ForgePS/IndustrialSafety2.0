import { ForgeError } from "@forge/errors";
import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { z } from "zod";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { AcknowledgmentService } from "./acknowledgment.service.js";
import { AttestationService } from "./attestation.service.js";
import { LegalDocumentsService } from "./legal-documents.service.js";

const acceptSchema = z.object({
  documentVersionIds: z.array(z.string().uuid()).min(1).max(20),
  acceptedAction: z.string().min(1).max(64).optional(),
  source: z.string().min(1).max(64).optional(),
});

const attestSchema = z.object({
  templateKey: z.string().min(1).max(128),
  module: z.string().min(1).max(64),
  recordType: z.string().min(1).max(128),
  recordId: z.string().uuid(),
  action: z.string().min(1).max(128),
});

@Controller("api/v1/legal")
export class LegalController {
  constructor(
    private readonly acknowledgments: AcknowledgmentService,
    private readonly attestations: AttestationService,
    private readonly documents: LegalDocumentsService,
  ) {}

  @Get("requirements/current")
  async currentRequirements(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const data = await this.acknowledgments.summaryForMe(principal.tenantId, principal);
    return ok(data, getRequestIds(req));
  }

  @Get("documents/:documentId/versions/:versionId")
  async getVersion(
    @Principal() principal: ForgePrincipal,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.acknowledgments.getVersion(
      principal.tenantId,
      documentId,
      versionId,
    );
    return ok(data, getRequestIds(req));
  }

  @Post("acknowledgments")
  async acknowledge(
    @Principal() principal: ForgePrincipal,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    const parsed = acceptSchema.parse(body);
    const ids = getRequestIds(req);
    const data = await this.acknowledgments.accept(principal.tenantId, principal, {
      documentVersionIds: parsed.documentVersionIds,
      ...(parsed.acceptedAction ? { acceptedAction: parsed.acceptedAction } : {}),
      ...(parsed.source ? { source: parsed.source } : {}),
      authSessionId: typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : null,
      ipAddress: clientIp(req),
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
      correlationId: ids.correlationId,
      requestId: ids.requestId,
    });
    return ok(data, ids);
  }

  @Get("acknowledgments/me")
  async myAcknowledgments(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const items = await this.acknowledgments.listMine(principal.tenantId, principal);
    return ok({ items }, getRequestIds(req));
  }

  @Post("attestations")
  async createAttestation(
    @Principal() principal: ForgePrincipal,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    const parsed = attestSchema.parse(body);
    const ids = getRequestIds(req);
    const data = await this.attestations.sign(principal.tenantId, principal, {
      ...parsed,
      authSessionId: typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : null,
      ipAddress: clientIp(req),
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
      correlationId: ids.correlationId,
      requestId: ids.requestId,
    });
    return ok(data, ids);
  }

  @Get("attestations/:id")
  async getAttestation(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.attestations.getById(principal.tenantId, id);
    return ok(data, getRequestIds(req));
  }
}

@Controller("api/v1/legal/admin")
export class LegalAdminController {
  constructor(
    private readonly acknowledgments: AcknowledgmentService,
    private readonly documents: LegalDocumentsService,
  ) {}

  @Get("documents")
  @RequireAnyPermission([
    "industrial.legal.documents.read",
    "industrial.legal.tenantPolicies.read",
    "industrial.admin",
  ])
  async listDocuments(
    @Principal() principal: ForgePrincipal,
    @Query("scope") scope: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.documents.listDocuments(
      principal.tenantId,
      scope === "global" || scope === "tenant" ? scope : "all",
    );
    return ok(data, getRequestIds(req));
  }

  @Get("documents/:documentId/versions")
  @RequireAnyPermission([
    "industrial.legal.documents.read",
    "industrial.legal.tenantPolicies.read",
    "industrial.admin",
  ])
  async listVersions(
    @Principal() principal: ForgePrincipal,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.documents.listVersions(principal.tenantId, documentId);
    return ok(data, getRequestIds(req));
  }

  @Post("tenant-policies")
  @RequireAnyPermission([
    "industrial.legal.tenantPolicies.manage",
    "industrial.legal.tenantPolicies.publish",
    "industrial.admin",
  ])
  async createTenantPolicy(
    @Principal() principal: ForgePrincipal,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    const parsed = z
      .object({
        documentKey: z.string().min(1).max(128),
        title: z.string().min(1).max(500),
        description: z.string().max(2000).optional(),
        content: z.string().min(1),
        version: z.string().min(1).max(64).optional(),
        requireReacknowledgment: z.boolean().optional(),
        publish: z.boolean().optional(),
      })
      .parse(body);
    const ids = getRequestIds(req);
    const data = await this.documents.createTenantPolicy(principal.tenantId, principal, {
      documentKey: parsed.documentKey,
      title: parsed.title,
      content: parsed.content,
      ...(parsed.description ? { description: parsed.description } : {}),
      ...(parsed.version ? { version: parsed.version } : {}),
      ...(parsed.requireReacknowledgment !== undefined
        ? { requireReacknowledgment: parsed.requireReacknowledgment }
        : {}),
      ...(parsed.publish !== undefined ? { publish: parsed.publish } : {}),
      correlationId: ids.correlationId,
      requestId: ids.requestId,
    });
    return ok(data, ids);
  }

  @Post("documents/:documentId/versions/publish")
  @RequireAnyPermission([
    "industrial.legal.documents.publish",
    "industrial.legal.tenantPolicies.publish",
    "industrial.admin",
  ])
  async publishVersion(
    @Principal() principal: ForgePrincipal,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    const parsed = z
      .object({
        content: z.string().min(1),
        version: z.string().min(1).max(64),
        changeSummary: z.string().max(2000).optional(),
        materialChange: z.boolean().optional(),
        requiresReacknowledgment: z.boolean().optional(),
        effectiveAt: z.string().optional(),
        confirmReacknowledgmentImpact: z.boolean().optional(),
      })
      .parse(body);
    if (parsed.requiresReacknowledgment !== false && !parsed.confirmReacknowledgmentImpact) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Publishing this version will require affected users to acknowledge the new version before continuing. Set confirmReacknowledgmentImpact=true to proceed.",
      );
    }
    const ids = getRequestIds(req);
    const data = await this.documents.publishVersion(principal.tenantId, principal, documentId, {
      content: parsed.content,
      version: parsed.version,
      ...(parsed.changeSummary ? { changeSummary: parsed.changeSummary } : {}),
      ...(parsed.materialChange !== undefined ? { materialChange: parsed.materialChange } : {}),
      ...(parsed.requiresReacknowledgment !== undefined
        ? { requiresReacknowledgment: parsed.requiresReacknowledgment }
        : {}),
      ...(parsed.effectiveAt ? { effectiveAt: parsed.effectiveAt } : {}),
      correlationId: ids.correlationId,
      requestId: ids.requestId,
    });
    return ok(data, ids);
  }

  @Get("acknowledgments")
  @RequireAnyPermission([
    "industrial.legal.acknowledgments.read_tenant",
    "industrial.legal.acknowledgments.export",
    "industrial.admin",
  ])
  async list(
    @Principal() principal: ForgePrincipal,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.acknowledgments.adminList(principal.tenantId, principal, {
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 25,
    });
    return ok(data, getRequestIds(req));
  }

  @Get("acknowledgments/export")
  async exportCsv(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res() res: import("express").Response,
  ) {
    const ids = getRequestIds(req);
    const csv = await this.acknowledgments.exportCsv(principal.tenantId, principal, ids);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="legal-acknowledgments.csv"');
    res.send(csv);
  }

  @Get("acknowledgments/:id")
  async getOne(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.acknowledgments.adminGet(principal.tenantId, principal, id);
    return ok(data, getRequestIds(req));
  }
}

function clientIp(req: RequestWithIds): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return req.socket?.remoteAddress ?? null;
}
