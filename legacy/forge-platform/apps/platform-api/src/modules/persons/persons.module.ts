import { Module } from "@nestjs/common";
import { SensitiveDataService } from "../../common/sensitive-data.service.js";
import { PersonsController } from "./persons.controller.js";
import { PersonsService } from "./persons.service.js";

@Module({
  controllers: [PersonsController],
  providers: [PersonsService, SensitiveDataService],
  exports: [PersonsService],
})
export class PersonsModule {}
