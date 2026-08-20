import { Module } from "@nestjs/common";
import { ConfigurationModule } from "../configuration/configuration.module.js";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";
import { BrandingController } from "./branding.controller.js";
import { BrandingService } from "./branding.service.js";
import { LoginBrandingService } from "./login-branding.service.js";
import { PublicBrandingController } from "./public-branding.controller.js";

@Module({
  imports: [ConfigurationModule],
  controllers: [BrandingController, PublicBrandingController],
  providers: [BrandingService, DocumentStorageService, LoginBrandingService],
  exports: [BrandingService, LoginBrandingService],
})
export class BrandingModule {}
