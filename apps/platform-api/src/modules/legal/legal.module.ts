import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module.js";
import { AcknowledgmentService } from "./acknowledgment.service.js";
import { AttestationService } from "./attestation.service.js";
import { LegalDocumentsService } from "./legal-documents.service.js";
import { LegalAcknowledgmentGuard } from "./legal-acknowledgment.guard.js";
import { LegalAdminController, LegalController } from "./legal.controller.js";

@Module({
  imports: [AuditModule, FeatureFlagsModule],
  controllers: [LegalController, LegalAdminController],
  providers: [
    AcknowledgmentService,
    AttestationService,
    LegalDocumentsService,
    LegalAcknowledgmentGuard,
  ],
  exports: [AcknowledgmentService, AttestationService, LegalDocumentsService, LegalAcknowledgmentGuard],
})
export class LegalModule {}
