import { Module } from "@nestjs/common";
import { PlatformAnalyticsController } from "./platform-analytics.controller.js";
import { PlatformAnalyticsService } from "./platform-analytics.service.js";

@Module({
  controllers: [PlatformAnalyticsController],
  providers: [PlatformAnalyticsService],
  exports: [PlatformAnalyticsService],
})
export class PlatformAnalyticsModule {}
