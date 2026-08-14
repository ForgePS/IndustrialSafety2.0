import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { createLogger } from "@forge/observability";
import { AppModule } from "./app.module.js";
import { isOriginAllowed, parseCorsOriginRules } from "./common/cors-origin.js";
import { CorrelationIdMiddleware } from "./correlation.middleware.js";

async function bootstrap(): Promise<void> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const logger = createLogger({
    service: "platform-api",
    environment: env.APP_ENV,
  });

  const app = await NestFactory.create(AppModule.register(env), {
    logger: false,
    rawBody: true,
  });

  app.use(new CorrelationIdMiddleware().use.bind(new CorrelationIdMiddleware()));
  const rateLimit = new (await import("./common/rate-limit.middleware.js")).RateLimitMiddleware({
    windowMs: 60_000,
    max: 120,
  });
  app.use(rateLimit.use.bind(rateLimit));
  const corsRules = parseCorsOriginRules(env.CORS_ORIGINS, env.CORS_ORIGIN_SUFFIXES);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
      // Server-to-server callers send no Origin and are not subject to CORS.
      callback(null, origin ? isOriginAllowed(origin, corsRules) : true);
    },
    credentials: true,
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "If-Match",
      "X-Correlation-Id",
      "X-Request-Id",
      "X-Forge-Dev-Principal",
      "X-Forge-Dev-User",
      "X-Tenant-Id",
    ],
  });
  app.use(
    (
      _req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-XSS-Protection", "0");
      res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      // Browser clients call the API from separate CloudFront origins (ADR-036).
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      if (env.APP_ENV !== "local") {
        res.setHeader(
          "Strict-Transport-Security",
          "max-age=31536000; includeSubDomains",
        );
      }
      next();
    },
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  logger.info("platform-api listening", { port });

  const shutdown = async () => {
    logger.info("graceful shutdown started");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
