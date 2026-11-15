import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { createLogger } from "@forge/observability";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return {
      status: "ok",
      service: "ai-narrative-api",
      narrativeHttp: "hosted-on-platform-api",
      routes: "/api/v1/ai/*",
      defaultEnabled: false,
    };
  }
}

@Module({
  controllers: [HealthController],
})
class AiNarrativeAppModule {}

async function bootstrap(): Promise<void> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const logger = createLogger({
    service: "ai-narrative-api",
    environment: env.APP_ENV,
  });

  const app = await NestFactory.create(AiNarrativeAppModule, { logger: false });
  const port = Number(process.env.AI_NARRATIVE_API_PORT ?? 3010);
  await app.listen(port);
  logger.info("ai-narrative-api listening", {
    port,
    note: "Versioned narrative routes are mounted on platform-api for foundation; dedicated ECS split requires product-owner authorization",
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
