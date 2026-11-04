import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import { PhotoMarkupController } from "./photo-markup.controller.js";
import { PhotoMarkupService } from "./photo-markup.service.js";

@Module({
  imports: [AuditModule],
  controllers: [PhotoMarkupController],
  providers: [PhotoMarkupService, DocumentStorageService],
  exports: [PhotoMarkupService],
})
export class PhotoMarkupModule {}
