import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module.js";
import { IndustrialBootstrapService } from "./industrial-bootstrap.service.js";
import { IndustrialController } from "./industrial.controller.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";
import { IndustrialFlatController } from "./industrial-flat.controller.js";
import { IndustrialFleetService } from "./industrial-fleet.service.js";
import { IndustrialPublicCloseoutController } from "./industrial-public-closeout.controller.js";
import { IndustrialService } from "./industrial.service.js";
import { IndustrialTrainingController } from "./industrial-training.controller.js";
import { IndustrialTrainingService } from "./industrial-training.service.js";

@Module({
  imports: [FeatureFlagsModule],
  // IndustrialTrainingController must precede IndustrialFlatController: the flat
  // controller owns the catch-all `:module/:id` routes, so if it registered
  // first, GET /industrial/training/records would match module=training,
  // id=records and 404 as "Record not found" instead of reaching the LMS.
  controllers: [
    IndustrialController,
    IndustrialTrainingController,
    IndustrialPublicCloseoutController,
    IndustrialFlatController,
  ],
  providers: [
    IndustrialService,
    IndustrialBootstrapService,
    IndustrialDomainService,
    IndustrialFleetService,
    IndustrialTrainingService,
  ],
  exports: [
    IndustrialService,
    IndustrialDomainService,
    IndustrialFleetService,
    IndustrialTrainingService,
  ],
})
export class IndustrialModule {}
