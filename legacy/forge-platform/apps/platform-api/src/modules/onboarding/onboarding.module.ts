import { Module } from "@nestjs/common";
import { BrandingModule } from "../branding/branding.module.js";
import { ConfigurationModule } from "../configuration/configuration.module.js";
import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { InvitationsModule } from "../invitations/invitations.module.js";
import { OrganizationsModule } from "../organizations/organizations.module.js";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module.js";
import { TenantsModule } from "../tenants/tenants.module.js";
import { OnboardingController } from "./onboarding.controller.js";
import { OnboardingService } from "./onboarding.service.js";

@Module({
  imports: [
    TenantsModule,
    OrganizationsModule,
    EntitlementsModule,
    SubscriptionsModule,
    BrandingModule,
    ConfigurationModule,
    InvitationsModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
