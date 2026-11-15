import { Global, Module } from "@nestjs/common";
import { CognitoAdminService } from "./cognito-admin.service.js";

/** Shared Cognito administration. Global so auth and invitations can both use it. */
@Global()
@Module({
  providers: [CognitoAdminService],
  exports: [CognitoAdminService],
})
export class CognitoModule {}
