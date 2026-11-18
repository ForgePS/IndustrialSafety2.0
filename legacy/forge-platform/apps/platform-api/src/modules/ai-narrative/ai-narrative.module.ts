import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AiNarrativeController } from "./ai-narrative.controller.js";
import { AiNarrativeService } from "./ai-narrative.service.js";

@Module({
  imports: [AuditModule],
  controllers: [AiNarrativeController],
  providers: [AiNarrativeService],
  exports: [AiNarrativeService],
})
export class AiNarrativeModule {}
