import { Module } from "@nestjs/common";
import { SupportActionsController } from "./support-actions.controller.js";
import { SupportActionsService } from "./support-actions.service.js";

@Module({
  controllers: [SupportActionsController],
  providers: [SupportActionsService],
  exports: [SupportActionsService],
})
export class SupportModule {}
