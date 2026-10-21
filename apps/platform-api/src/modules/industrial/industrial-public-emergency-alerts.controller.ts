import { Controller, Get, Header, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth-context/public.decorator.js";
import { IndustrialEmergencyAlertsService } from "./industrial-emergency-alerts.service.js";

/**
 * Public CAP feed for Mvix CAP Alert App. No administrative data.
 * Path: GET /api/v1/public/emergency-alerts/cap/:publicFeedId
 */
@Controller("api/v1/public/emergency-alerts")
export class IndustrialPublicEmergencyAlertsController {
  constructor(private readonly alerts: IndustrialEmergencyAlertsService) {}

  @Get("cap/:publicFeedId")
  @Public()
  @Header("Cache-Control", "no-store")
  async capFeed(@Param("publicFeedId") publicFeedId: string, @Res() res: Response) {
    const xml = await this.alerts.renderPublicCapFeed(publicFeedId);
    res.type("application/atom+xml").send(xml);
  }
}
