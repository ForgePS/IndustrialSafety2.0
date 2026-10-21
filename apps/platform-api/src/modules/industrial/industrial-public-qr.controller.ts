import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Public } from "../auth-context/public.decorator.js";
import { IndustrialPublicQrService } from "./industrial-public-qr.service.js";

@Controller("api/v1/public/scan")
export class IndustrialPublicQrController {
  constructor(private readonly publicQr: IndustrialPublicQrService) {}

  @Get(":token")
  @Public()
  async getContext(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.publicQr.getScanContext(token), getRequestIds(req));
  }

  @Get(":token/loto")
  @Public()
  async getLoto(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.publicQr.getPublicLotoProcedure(token), getRequestIds(req));
  }

  @Post(":token/identify")
  @Public()
  async identify(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicQr.identifyEmployee(token, String(body.employeeNumber ?? "")),
      getRequestIds(req),
    );
  }

  @Post(":token/sms-signup")
  @Public()
  async smsSignup(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (typeof forwarded === "string" && forwarded.split(",")[0]?.trim()) ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = req.header("user-agent") ?? null;
    return ok(
      await this.publicQr.submitSmsSignup(token, body, { ip, userAgent }),
      getRequestIds(req),
    );
  }

  @Post(":token/actions")
  @Public()
  async listActions(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    // Never trust client-supplied permissions — derive from Bearer when present.
    return ok(
      await this.publicQr.listActions(token, {
        ...(typeof body.employeeNumber === "string" && body.employeeNumber.trim()
          ? { employeeNumber: body.employeeNumber.trim() }
          : {}),
        req,
      }),
      getRequestIds(req),
    );
  }

  @Post(":token/history")
  @Public()
  async history(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicQr.getAssetHistory(token, {
        ...(typeof body.employeeNumber === "string" && body.employeeNumber.trim()
          ? { employeeNumber: body.employeeNumber.trim() }
          : {}),
        req,
      }),
      getRequestIds(req),
    );
  }

  @Post(":token/report-issue")
  @Public()
  async reportIssue(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.publicQr.reportIssue(token, body), getRequestIds(req));
  }

  @Post(":token/out-of-service")
  @Public()
  async outOfService(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.publicQr.markOutOfService(token, body), getRequestIds(req));
  }

  @Post(":token/return-to-service")
  @Public()
  async returnToService(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.publicQr.returnToService(token, body), getRequestIds(req));
  }

  @Post(":token/inspections")
  @Public()
  async startInspection(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.publicQr.startInspection(token, body), getRequestIds(req));
  }

  @Post(":token/inspections/:inspectionId/complete")
  @Public()
  async completeInspection(
    @Param("token") token: string,
    @Param("inspectionId") inspectionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicQr.completeInspection(token, inspectionId, body),
      getRequestIds(req),
    );
  }
}
