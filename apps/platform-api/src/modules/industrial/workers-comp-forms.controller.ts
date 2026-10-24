import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { WorkersCompFormsService } from "./workers-comp-forms.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
// Route-level gates. The service applies the per-form rules (HIPAA needs the WC medical permissions).
const VIEW = [
  "industrial.workers_comp.view",
  "industrial.workers_comp.manage",
  "industrial.workers_comp.medical.view",
  "industrial.workers_comp.medical.manage",
  "industrial.admin",
  "industrial.access",
] as const;
const ACT = [
  "industrial.workers_comp.manage",
  "industrial.workers_comp.medical.manage",
  "industrial.admin",
] as const;

function sendPdf(
  res: Response,
  filename: string,
  pdf: Buffer,
  disposition: "inline" | "attachment",
) {
  const safeName = filename.replace(/[^\w.-]+/g, "_").slice(0, 180) || "form.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
  res.setHeader("Content-Length", String(pdf.length));
  // Forms can hold protected health information: never cache them.
  res.setHeader("Cache-Control", "no-store, private");
  res.end(pdf);
}

/**
 * Producers paper forms on workers' comp cases under /api/v1/industrial/workers-comp-forms.
 * Registered before IndustrialFlatController catch-alls.
 */
@Controller("api/v1/industrial/workers-comp-forms")
export class WorkersCompFormsController {
  constructor(private readonly forms: WorkersCompFormsService) {}

  @Get("cases/:caseId")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async list(
    @Principal() principal: ForgePrincipal,
    @Param("caseId") caseId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.forms.list(principal, caseId), getRequestIds(req));
  }

  @Post("cases/:caseId")
  @RequireAnyPermission([...ACT], { requiresEntitlement: ENTITLEMENT })
  @Idempotent({ resourceType: "industrial_workers_comp_form" })
  async create(
    @Principal() principal: ForgePrincipal,
    @Param("caseId") caseId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.forms.create(principal, caseId, body ?? {}), getRequestIds(req));
  }

  @Get("recipients")
  @RequireAnyPermission([...ACT], { requiresEntitlement: ENTITLEMENT })
  async recipients(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.forms.recipients(principal), getRequestIds(req));
  }

  @Get("templates/:formKey/blank")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async blank(
    @Principal() principal: ForgePrincipal,
    @Param("formKey") formKey: string,
    @Res() res: Response,
  ) {
    const { filename, pdf } = await this.forms.blankPdf(principal, formKey);
    sendPdf(res, filename, pdf, "inline");
  }

  @Get(":formId/pdf")
  @RequireAnyPermission([...VIEW], { requiresEntitlement: ENTITLEMENT })
  async pdf(
    @Principal() principal: ForgePrincipal,
    @Param("formId") formId: string,
    @Res() res: Response,
  ) {
    const { filename, pdf } = await this.forms.filledPdf(principal, formId);
    sendPdf(res, filename, pdf, "inline");
  }

  @Post(":formId/void")
  @RequireAnyPermission([...ACT], { requiresEntitlement: ENTITLEMENT })
  async void(
    @Principal() principal: ForgePrincipal,
    @Param("formId") formId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.forms.void(principal, formId, body ?? {}), getRequestIds(req));
  }

  @Post(":formId/email")
  @RequireAnyPermission([...ACT], { requiresEntitlement: ENTITLEMENT })
  async email(
    @Principal() principal: ForgePrincipal,
    @Param("formId") formId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.forms.email(principal, formId, body ?? {}), getRequestIds(req));
  }
}
