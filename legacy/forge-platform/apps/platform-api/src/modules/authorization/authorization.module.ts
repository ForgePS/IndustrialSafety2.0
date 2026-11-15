import { Module } from "@nestjs/common";
import { AuthorizationController } from "./authorization.controller.js";
import { AuthorizationService } from "./authorization.service.js";

@Module({
  controllers: [AuthorizationController],
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
