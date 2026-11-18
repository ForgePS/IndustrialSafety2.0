import { DynamicModule, Global, Module } from "@nestjs/common";
import type { ForgeEnvironment } from "@forge/environment";
import { APP_ENV } from "../tokens.js";
import { DatabaseProvider } from "./database.provider.js";

@Global()
@Module({})
export class DatabaseModule {
  static register(env: ForgeEnvironment): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [{ provide: APP_ENV, useValue: env }, DatabaseProvider],
      exports: [APP_ENV, DatabaseProvider],
    };
  }
}
