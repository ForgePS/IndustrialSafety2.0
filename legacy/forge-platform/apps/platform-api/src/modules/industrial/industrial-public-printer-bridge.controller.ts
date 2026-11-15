import { Body, Controller, Get, Headers, Param, Post, Query, Req } from "@nestjs/common";
import { ForgeError } from "@forge/errors";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Public } from "../auth-context/public.decorator.js";
import { IndustrialPrintService } from "./industrial-print.service.js";

function requireBridgeHeaders(
  deviceIdHeader: string | undefined,
  accessTokenHeader: string | undefined,
  pathDeviceId?: string,
): { deviceId: string; accessToken: string } {
  const deviceId = String(deviceIdHeader ?? pathDeviceId ?? "").trim();
  const accessToken = String(accessTokenHeader ?? "").trim();
  if (!deviceId || !accessToken) {
    throw new ForgeError("UNAUTHORIZED", "X-Bridge-Device-Id and X-Bridge-Access-Token required");
  }
  if (pathDeviceId && pathDeviceId !== deviceId) {
    throw new ForgeError("FORBIDDEN", "Device id header does not match path");
  }
  return { deviceId, accessToken };
}

/**
 * Public Forge Printer Bridge API (no Cognito).
 * Auth: X-Bridge-Device-Id + X-Bridge-Access-Token (hashed server-side).
 */
@Controller("api/v1/printer-bridge/v1")
export class IndustrialPublicPrinterBridgeController {
  constructor(private readonly print: IndustrialPrintService) {}

  @Post("pair")
  @Public()
  async pair(@Body() body: Record<string, unknown>, @Req() req: RequestWithIds) {
    return ok(await this.print.consumePairing(body ?? {}), getRequestIds(req));
  }

  @Post("bridges/:deviceId/heartbeat")
  @Public()
  async heartbeat(
    @Param("deviceId") deviceId: string,
    @Headers("x-bridge-device-id") deviceIdHeader: string | undefined,
    @Headers("x-bridge-access-token") accessTokenHeader: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const auth = requireBridgeHeaders(deviceIdHeader, accessTokenHeader, deviceId);
    return ok(
      await this.print.heartbeat(auth.deviceId, auth.accessToken, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("bridges/:deviceId/printers")
  @Public()
  async upsertPrinters(
    @Param("deviceId") deviceId: string,
    @Headers("x-bridge-device-id") deviceIdHeader: string | undefined,
    @Headers("x-bridge-access-token") accessTokenHeader: string | undefined,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    const auth = requireBridgeHeaders(deviceIdHeader, accessTokenHeader, deviceId);
    return ok(
      await this.print.upsertPrinters(auth.deviceId, auth.accessToken, body),
      getRequestIds(req),
    );
  }

  @Get("bridges/:deviceId/jobs")
  @Public()
  async claimJobs(
    @Param("deviceId") deviceId: string,
    @Headers("x-bridge-device-id") deviceIdHeader: string | undefined,
    @Headers("x-bridge-access-token") accessTokenHeader: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const auth = requireBridgeHeaders(deviceIdHeader, accessTokenHeader, deviceId);
    const take = Math.max(1, Number(limit ?? 10) || 10);
    return ok(
      await this.print.claimNextJobs(auth.deviceId, auth.accessToken, take),
      getRequestIds(req),
    );
  }

  @Post("jobs/:jobId/status")
  @Public()
  async updateJobStatus(
    @Param("jobId") jobId: string,
    @Headers("x-bridge-device-id") deviceIdHeader: string | undefined,
    @Headers("x-bridge-access-token") accessTokenHeader: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const auth = requireBridgeHeaders(deviceIdHeader, accessTokenHeader);
    return ok(
      await this.print.updateJobStatusFromBridge(
        auth.deviceId,
        auth.accessToken,
        jobId,
        body ?? {},
      ),
      getRequestIds(req),
    );
  }

  @Get("bridges/:deviceId/connect-info")
  @Public()
  async connectInfo(@Param("deviceId") deviceId: string, @Req() req: RequestWithIds) {
    return ok(this.print.getConnectInfo(deviceId), getRequestIds(req));
  }
}
