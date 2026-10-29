import { Body, Controller, Get, Headers, Param, Patch, Post, Req, Res } from "@nestjs/common";
import type { BillingProviderCode } from "@forge/contracts";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { BillingService } from "./billing.service.js";

const BILLING_READ = ["platform.entitlement.manage", "tenant.billing.read"] as const;

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("api/v1/tenants/:tenantId/billing/overview")
  @RequireAnyPermission([...BILLING_READ], { allowWhenSuspended: true })
  async overview(
    @Param("tenantId") tenantId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.billing.getOverview(tenantId, principal);
    return ok(data, getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/billing/customers")
  @RequireAnyPermission([...BILLING_READ], { allowWhenSuspended: true })
  async getCustomer(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.billing.getCustomer(tenantId);
    return ok(data, getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/billing/customers")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async ensureCustomer(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.billing.ensureCustomer(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Patch("api/v1/tenants/:tenantId/billing/customers")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async patchCustomer(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "billing_customer");
    const data = await this.billing.patchCustomer(tenantId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/billing/contracts")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async createContract(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.billing.createContract(tenantId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/billing/contracts")
  @RequireAnyPermission([...BILLING_READ], { allowWhenSuspended: true })
  async listContracts(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.billing.listContracts(tenantId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Patch("api/v1/tenants/:tenantId/billing/contracts/:contractId")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async patchContract(
    @Param("tenantId") tenantId: string,
    @Param("contractId") contractId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "billing_contract");
    const data = await this.billing.patchContract(tenantId, contractId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/billing/fees")
  @RequireAnyPermission([...BILLING_READ], { allowWhenSuspended: true })
  async listFees(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.billing.listFees(tenantId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Post("api/v1/tenants/:tenantId/billing/fees")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async addFee(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.billing.addFeeLine(tenantId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Post("api/v1/tenants/:tenantId/billing/orders")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async createOrder(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.billing.createOrder(tenantId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Get("api/v1/tenants/:tenantId/billing/invoices")
  @RequireAnyPermission([...BILLING_READ], { allowWhenSuspended: true })
  async listInvoices(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.billing.listInvoices(tenantId);
    return ok(data, getRequestIds(req), {
      page: 1,
      pageSize: data.length,
      total: data.length,
    });
  }

  @Post("api/v1/tenants/:tenantId/billing/invoices")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async recordInvoice(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.billing.recordInvoiceMetadata(tenantId, body, principal);
    return ok(data, getRequestIds(req));
  }

  @Patch("api/v1/tenants/:tenantId/billing/invoices/:invoiceId")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async patchInvoice(
    @Param("tenantId") tenantId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = requireIfMatch(req, "billing_invoice");
    const data = await this.billing.patchInvoice(tenantId, invoiceId, body, principal, expected);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post("api/v1/platform/billing/webhooks/:provider")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async webhook(
    @Param("provider") providerParam: string,
    @Body() body: unknown,
    @Headers("x-forge-billing-signature") signature: string | undefined,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const provider = providerParam.toUpperCase() as BillingProviderCode;
    if (!["NONE", "STUB", "STRIPE", "MANUAL"].includes(provider)) {
      throw new ForgeError("BAD_REQUEST", `Unknown billing provider ${providerParam}`);
    }
    const secret =
      process.env.BILLING_WEBHOOK_SECRET ??
      (provider === "STUB" || provider === "NONE" ? "forge-billing-stub-secret" : "");
    const rawBody =
      typeof (req as { rawBody?: unknown }).rawBody === "string"
        ? String((req as { rawBody?: string }).rawBody)
        : JSON.stringify(body);
    const data = await this.billing.ingestProviderEvent({
      provider,
      rawBody,
      ...(signature ? { signatureHeader: signature } : {}),
      secret,
      body,
      principal,
    });
    return ok(data, getRequestIds(req));
  }
}
