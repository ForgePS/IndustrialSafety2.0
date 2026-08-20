import { Global, Module, forwardRef } from "@nestjs/common";
import { LegalModule } from "../legal/legal.module.js";
import { AuthContextService } from "./auth-context.service.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthMeController } from "./auth-me.controller.js";
import { AuthPasswordController } from "./auth-password.controller.js";
import { AuthProfileService } from "./auth-profile.service.js";
import { AuthorizationDecisionService } from "./authorization-decision.service.js";
import { PermissionGuard } from "./permission.guard.js";
import { TenantGuard } from "./tenant.guard.js";

@Global()
@Module({
  imports: [forwardRef(() => LegalModule)],
  controllers: [AuthMeController, AuthPasswordController],
  providers: [
    AuthContextService,
    AuthProfileService,
    AuthorizationDecisionService,
    AuthGuard,
    PermissionGuard,
    TenantGuard,
  ],
  exports: [
    AuthContextService,
    AuthProfileService,
    AuthorizationDecisionService,
    AuthGuard,
    PermissionGuard,
    TenantGuard,
  ],
})
export class AuthContextModule {}
