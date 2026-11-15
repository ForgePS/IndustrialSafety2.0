import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { ExportsController } from "./exports.controller.js";
import { ExportsService } from "./exports.service.js";

@Module({
  imports: [AuditModule, JobsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
