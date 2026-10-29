import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { WebPushController } from "./web-push.controller.js";
import { WebPushService } from "./web-push.service.js";

@Module({
  controllers: [NotificationsController, WebPushController],
  providers: [NotificationsService, WebPushService],
  exports: [NotificationsService, WebPushService],
})
export class NotificationsModule {}
