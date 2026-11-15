import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module.js";
import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { IndustrialBootstrapService } from "./industrial-bootstrap.service.js";
import { IndustrialController } from "./industrial.controller.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";
import { IndustrialEmergencyAlertsController } from "./industrial-emergency-alerts.controller.js";
import { IndustrialEmergencyAlertsService } from "./industrial-emergency-alerts.service.js";
import { IndustrialPublicEmergencyAlertsController } from "./industrial-public-emergency-alerts.controller.js";
import { IndustrialPublicSafetySuppliesController } from "./industrial-public-safety-supplies.controller.js";
import { IndustrialFlatController } from "./industrial-flat.controller.js";
import { IndustrialFleetService } from "./industrial-fleet.service.js";
import { IndustrialMessagingService } from "./industrial-messaging.service.js";
import { IndustrialSafetySuppliesService } from "./industrial-safety-supplies.service.js";
import { IndustrialSupplyRequestQrService } from "./industrial-supply-request-qr.service.js";
import { IndustrialMyWorkService } from "./industrial-my-work.service.js";
import { IndustrialDotDqfDocumentsService } from "./industrial-dot-dqf-documents.service.js";
import { IndustrialMvrConsentDocumentsService } from "./industrial-mvr-consent-documents.service.js";
import { IndustrialPersonnelCertificationsService } from "./industrial-personnel-certifications.service.js";
import { IndustrialPersonnelLicenseDocumentsService } from "./industrial-personnel-license-documents.service.js";
import { IndustrialPublicCloseoutController } from "./industrial-public-closeout.controller.js";
import { IndustrialPublicObservationsController } from "./industrial-public-observations.controller.js";
import { IndustrialPublicDvirController } from "./industrial-public-dvir.controller.js";
import { IndustrialPublicQrController } from "./industrial-public-qr.controller.js";
import { IndustrialPublicQrService } from "./industrial-public-qr.service.js";
import { IndustrialPublicTrainingController } from "./industrial-public-training.controller.js";
import { IndustrialPublicTrainingService } from "./industrial-public-training.service.js";
import { IndustrialQrController } from "./industrial-qr.controller.js";
import { IndustrialQrService } from "./industrial-qr.service.js";
import { IndustrialService } from "./industrial.service.js";
import { IndustrialSettingsModulesService } from "./industrial-settings-modules.service.js";
import { IndustrialPhotoMarkupSettingsService } from "./industrial-photo-markup-settings.service.js";
import { IndustrialTrainingController } from "./industrial-training.controller.js";
import { IndustrialTrainingService } from "./industrial-training.service.js";
import { IndustrialTrainingAssignmentsService } from "./industrial-training-assignments.service.js";
import { IndustrialTrainingLmsService } from "./industrial-training-lms.service.js";
import { IndustrialTrainingRecordAttachmentsService } from "./industrial-training-record-attachments.service.js";
import { IndustrialPersonnelDisciplineAttachmentsService } from "./industrial-personnel-discipline-attachments.service.js";
import { IndustrialPerformanceReportService } from "./industrial-performance-report.service.js";
import { IndustrialTrainingVideoNormalizeService } from "./industrial-training-video-normalize.service.js";
import { IndustrialIncidentAttachmentsService } from "./industrial-incident-attachments.service.js";
import {
  IndustrialCalendarController,
  IndustrialRemindersController,
} from "./industrial-calendar.controller.js";
import { IndustrialCalendarService } from "./industrial-calendar.service.js";
import { IndustrialTasksExtrasController } from "./industrial-tasks-extras.controller.js";
import { IndustrialTasksExtrasService } from "./industrial-tasks-extras.service.js";
import { IndustrialDocumentControlController } from "./industrial-document-control.controller.js";
import { WorkersCompFormsController } from "./workers-comp-forms.controller.js";
import { WorkersCompFormsService } from "./workers-comp-forms.service.js";
import { IndustrialDocumentControlService } from "./industrial-document-control.service.js";
import { IndustrialExecutiveWalkthroughController } from "./industrial-executive-walkthrough.controller.js";
import { IndustrialPublicExecutiveWalkthroughController } from "./industrial-public-executive-walkthrough.controller.js";
import { IndustrialExecutiveWalkthroughService } from "./industrial-executive-walkthrough.service.js";
import { IndustrialExecutiveWalkthroughNarrationService } from "./industrial-executive-walkthrough-narration.service.js";
import { IndustrialExecutiveWalkthroughRenderService } from "./industrial-executive-walkthrough-render.service.js";
import { WalkthroughStudioController } from "./walkthrough-studio.controller.js";
import { WalkthroughStudioPublicController } from "./walkthrough-studio-public.controller.js";
import { WalkthroughStudioService } from "./walkthrough-studio.service.js";
import { IndustrialDemoSeedService } from "./industrial-demo-seed.service.js";
import { IndustrialSanitationController } from "./industrial-sanitation.controller.js";
import { IndustrialSanitationService } from "./industrial-sanitation.service.js";
import { IndustrialPrintController } from "./industrial-print.controller.js";
import { IndustrialPublicPrinterBridgeController } from "./industrial-public-printer-bridge.controller.js";
import { IndustrialPrintService } from "./industrial-print.service.js";
import { IndustrialPrintCreatorController } from "./industrial-print-creator.controller.js";
import { IndustrialPrintCreatorService } from "./industrial-print-creator.service.js";
import { IndustrialLabelRendererService } from "./industrial-label-renderer.service.js";

@Module({
  imports: [FeatureFlagsModule, NotificationsModule, EntitlementsModule],
  // Dedicated controllers must precede IndustrialFlatController: the flat
  // controller owns the catch-all `:module/:id` routes.
  controllers: [
    IndustrialController,
    IndustrialTrainingController,
    IndustrialDocumentControlController,
    WorkersCompFormsController,
    IndustrialPrintController,
    IndustrialPrintCreatorController,
    IndustrialExecutiveWalkthroughController,
    WalkthroughStudioController,
    IndustrialCalendarController,
    IndustrialRemindersController,
    IndustrialTasksExtrasController,
    IndustrialSanitationController,
    IndustrialEmergencyAlertsController,
    IndustrialQrController,
    IndustrialPublicCloseoutController,
    IndustrialPublicObservationsController,
    IndustrialPublicDvirController,
    IndustrialPublicQrController,
    IndustrialPublicTrainingController,
    IndustrialPublicEmergencyAlertsController,
    IndustrialPublicSafetySuppliesController,
    IndustrialPublicExecutiveWalkthroughController,
    WalkthroughStudioPublicController,
    IndustrialPublicPrinterBridgeController,
    IndustrialFlatController,
  ],
  providers: [
    IndustrialService,
    IndustrialBootstrapService,
    IndustrialDomainService,
    IndustrialMessagingService,
    IndustrialEmergencyAlertsService,
    IndustrialSafetySuppliesService,
    IndustrialSupplyRequestQrService,
    IndustrialDotDqfDocumentsService,
    IndustrialMvrConsentDocumentsService,
    WorkersCompFormsService,
    IndustrialPersonnelCertificationsService,
    IndustrialPersonnelLicenseDocumentsService,
    IndustrialTrainingRecordAttachmentsService,
    IndustrialPersonnelDisciplineAttachmentsService,
    IndustrialPerformanceReportService,
    IndustrialIncidentAttachmentsService,
    IndustrialMyWorkService,
    IndustrialFleetService,
    DocumentStorageService,
    IndustrialTrainingVideoNormalizeService,
    IndustrialTrainingService,
    IndustrialTrainingAssignmentsService,
    IndustrialTrainingLmsService,
    IndustrialPublicTrainingService,
    IndustrialPublicQrService,
    IndustrialQrService,
    IndustrialSettingsModulesService,
    IndustrialPhotoMarkupSettingsService,
    IndustrialCalendarService,
    IndustrialTasksExtrasService,
    IndustrialDocumentControlService,
    IndustrialExecutiveWalkthroughNarrationService,
    IndustrialExecutiveWalkthroughRenderService,
    IndustrialExecutiveWalkthroughService,
    WalkthroughStudioService,
    IndustrialDemoSeedService,
    IndustrialSanitationService,
    IndustrialLabelRendererService,
    IndustrialPrintService,
    IndustrialPrintCreatorService,
  ],
  exports: [
    IndustrialService,
    IndustrialDomainService,
    IndustrialFleetService,
    IndustrialTrainingService,
    IndustrialTrainingAssignmentsService,
    IndustrialTrainingLmsService,
    IndustrialQrService,
    IndustrialCalendarService,
    IndustrialTasksExtrasService,
    IndustrialExecutiveWalkthroughService,
    IndustrialSanitationService,
    IndustrialPrintService,
  ],
})
export class IndustrialModule {}
