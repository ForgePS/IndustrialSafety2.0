import { Global, Module } from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service.js";

/** Cross-cutting services that any feature module may inject. */
@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class CommonModule {}
