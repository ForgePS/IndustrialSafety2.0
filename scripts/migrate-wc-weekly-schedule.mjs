#!/usr/bin/env node
/**
 * One-off (runs inside the platform-api image from /app/apps/platform-api):
 * run ReportingService.migrateWorkersCompWeeklyStatusSchedules() and print the
 * result or the full error (the sweep endpoint swallows it into its response).
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";

const DIST = "/app/apps/platform-api/dist";
const { AppModule } = await import(`${DIST}/app.module.js`);
const { ReportingService } = await import(`${DIST}/modules/reporting/reporting.service.js`);

const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const app = await NestFactory.createApplicationContext(AppModule.register(env), { logger: false });
let code = 0;
try {
  const reporting = app.get(ReportingService);
  const result = await reporting.migrateWorkersCompWeeklyStatusSchedules();
  console.log(JSON.stringify({ ok: true, result }));
} catch (error) {
  code = 1;
  console.log(
    JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      cause: error?.cause ? String(error.cause?.message ?? error.cause) : undefined,
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 8).join(" | ") : undefined,
    }),
  );
} finally {
  await app.close();
}
// Nest providers keep handles open after close; the one-off task must exit.
process.exit(code);
