import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { ForgeEnvironment } from "@forge/environment";
import { checkDatabaseHealth } from "@forge/database";
import { Public } from "./modules/auth-context/public.decorator.js";
import { APP_ENV } from "./tokens.js";

@Controller()
export class HealthController {
  constructor(@Inject(APP_ENV) private readonly env: ForgeEnvironment) {}

  @Get("health")
  @Public()
  getHealth() {
    return {
      status: "healthy",
      service: "platform-api",
      environment: this.env.APP_ENV,
      version: this.env.APP_VERSION,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  @Public()
  async getReady() {
    let databaseOk = false;
    try {
      databaseOk = await checkDatabaseHealth(this.env.DATABASE_URL);
    } catch {
      databaseOk = false;
    }
    if (!databaseOk) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        service: "platform-api",
        checks: { database: false },
        timestamp: new Date().toISOString(),
      });
    }
    return {
      status: "ready",
      service: "platform-api",
      checks: { database: true },
      timestamp: new Date().toISOString(),
    };
  }
}
