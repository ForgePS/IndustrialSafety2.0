import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module.js";
import { IndustrialBootstrapService } from "./industrial-bootstrap.service.js";
import { IndustrialController } from "./industrial.controller.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";
import { IndustrialFlatController } from "./industrial-flat.controller.js";
import { IndustrialService } from "./industrial.service.js";
import { IndustrialTrainingController } from "./industrial-training.controller.js";
import { IndustrialTrainingService } from "./industrial-training.service.js";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [IndustrialController, IndustrialFlatController, IndustrialTrainingController],
  providers: [
    IndustrialService,
    IndustrialBootstrapService,
    IndustrialDomainService,
    IndustrialTrainingService,
  ],
  exports: [IndustrialService, IndustrialDomainService, IndustrialTrainingService],
})
export class IndustrialModule {}
