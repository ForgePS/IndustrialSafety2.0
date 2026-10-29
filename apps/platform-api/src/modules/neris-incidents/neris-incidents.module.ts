import { Module } from "@nestjs/common";
import { NerisModule } from "../neris/neris.module.js";
import { DocumentStorageService } from "./document-storage.service.js";
import { IncidentAssignmentsService } from "./incident-assignments.service.js";
import { IncidentAttachmentsService } from "./incident-attachments.service.js";
import { IncidentFormDescriptorService } from "./incident-form-descriptor.service.js";
import { IncidentNumberingService } from "./incident-numbering.service.js";
import { IncidentPrefillService } from "./incident-prefill.service.js";
import { IncidentStateMachineService } from "./incident-state-machine.service.js";
import { IncidentValidationService } from "./incident-validation.service.js";
import { MALWARE_SCANNER, QuarantineDefaultMalwareScanner } from "./malware-scan.interface.js";
import { NerisIncidentsAccessService } from "./neris-incidents-access.service.js";
import { NerisIncidentsController } from "./neris-incidents.controller.js";
import { NerisIncidentsService } from "./neris-incidents.service.js";
import {
  NerisProposedMasterUpdatesController,
  NerisSpecialtyController,
} from "./neris-specialty.controller.js";
import { SpecialtyRecordsService } from "./specialty-records.service.js";
import { SpecialtyValidationService } from "./specialty-validation.service.js";

@Module({
  imports: [NerisModule],
  controllers: [
    NerisIncidentsController,
    NerisSpecialtyController,
    NerisProposedMasterUpdatesController,
  ],
  providers: [
    NerisIncidentsAccessService,
    IncidentNumberingService,
    IncidentStateMachineService,
    SpecialtyValidationService,
    IncidentValidationService,
    IncidentPrefillService,
    IncidentFormDescriptorService,
    IncidentAssignmentsService,
    NerisIncidentsService,
    DocumentStorageService,
    SpecialtyRecordsService,
    IncidentAttachmentsService,
    { provide: MALWARE_SCANNER, useClass: QuarantineDefaultMalwareScanner },
  ],
  exports: [NerisIncidentsService, SpecialtyRecordsService, IncidentAttachmentsService],
})
export class NerisIncidentsModule {}
