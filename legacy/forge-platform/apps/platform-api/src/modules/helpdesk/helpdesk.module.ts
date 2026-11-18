import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { HelpdeskController } from "./helpdesk.controller.js";
import { HelpdeskService } from "./helpdesk.service.js";

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [HelpdeskController],
  providers: [HelpdeskService, DocumentStorageService],
  exports: [HelpdeskService],
})
export class HelpdeskModule {}
