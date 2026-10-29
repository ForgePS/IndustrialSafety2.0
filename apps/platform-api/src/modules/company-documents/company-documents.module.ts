import { Module } from "@nestjs/common";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";
import { CompanyDocumentsController } from "./company-documents.controller.js";
import { CompanyDocumentsService } from "./company-documents.service.js";

@Module({
  controllers: [CompanyDocumentsController],
  providers: [CompanyDocumentsService, DocumentStorageService],
  exports: [CompanyDocumentsService],
})
export class CompanyDocumentsModule {}
