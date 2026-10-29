import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { CadConnectionsController } from "./cad-connections.controller.js";
import { CadConnectionsService } from "./cad-connections.service.js";
import { CadConflictsController } from "./cad-conflicts.controller.js";
import { CadConflictsService } from "./cad-conflicts.service.js";
import { CadSimulatorController } from "./cad-simulator.controller.js";
import { CadSimulatorService } from "./cad-simulator.service.js";
import { CadWebhookController } from "./cad-webhook.controller.js";
import { CadWebhookService } from "./cad-webhook.service.js";

@Module({
  imports: [AuditModule],
  controllers: [
    CadWebhookController,
    CadConflictsController,
    CadConnectionsController,
    CadSimulatorController,
  ],
  providers: [CadWebhookService, CadConflictsService, CadConnectionsService, CadSimulatorService],
  exports: [CadWebhookService, CadConflictsService, CadConnectionsService, CadSimulatorService],
})
export class CadModule {}
