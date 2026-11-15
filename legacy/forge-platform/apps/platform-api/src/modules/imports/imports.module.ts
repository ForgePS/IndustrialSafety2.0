import { Module } from "@nestjs/common";
import { ConfigurationModule } from "../configuration/configuration.module.js";
import { ImportDuplicatesService } from "./import-duplicates.service.js";
import { ImportExecutionService } from "./import-execution.service.js";
import { ImportQueueService } from "./import-queue.service.js";
import { ImportSecurityService } from "./import-security.service.js";
import { ImportStorageService } from "./import-storage.service.js";
import { ImportUploadService } from "./import-upload.service.js";
import { ImportsController } from "./imports.controller.js";
import { ImportsRepository } from "./imports.repository.js";
import { ImportsService } from "./imports.service.js";

@Module({
  imports: [ConfigurationModule],
  controllers: [ImportsController],
  providers: [
    ImportsRepository,
    ImportsService,
    ImportStorageService,
    ImportQueueService,
    ImportUploadService,
    ImportDuplicatesService,
    ImportExecutionService,
    ImportSecurityService,
  ],
  exports: [
    ImportsService,
    ImportUploadService,
    ImportDuplicatesService,
    ImportExecutionService,
    ImportSecurityService,
  ],
})
export class ImportsModule {}
