import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { IndustrialModule } from "../industrial/industrial.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ReportingController } from "./reporting.controller.js";
import { ReportingService } from "./reporting.service.js";

@Module({
  imports: [AuditModule, NotificationsModule, IndustrialModule],
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
