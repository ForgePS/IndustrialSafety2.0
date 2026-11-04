import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { createLogger } from "@forge/observability";
import { registerProofEventHandlers } from "./event-processing/proof-handlers.js";
import { ImportSqsConsumer } from "./processors/import-upload-consumer.js";
import { ReportingSchedulesSqsConsumer } from "./processors/reporting-schedules-consumer.js";
import { OutboxPublisher, resolveEventBusName } from "./processors/outbox-publisher.js";
import { resolveIntegrationQueueUrl, SqsConsumer } from "./processors/sqs-consumer.js";

async function main(): Promise<void> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const logger = createLogger({
    service: "worker-service",
    environment: env.APP_ENV,
  });

  registerProofEventHandlers();

  let shuttingDown = false;
  let outboxTimer: ReturnType<typeof setInterval> | undefined;
  let sqsTimer: ReturnType<typeof setInterval> | undefined;
  let reportingSchedulesTimer: ReturnType<typeof setInterval> | undefined;
  let importTimer: ReturnType<typeof setInterval> | undefined;

  const publisher = new OutboxPublisher({
    databaseUrl: env.DATABASE_URL,
    region: env.AWS_REGION,
    eventBusName: resolveEventBusName(process.env),
    environment: env.APP_ENV,
  });

  const integrationQueueUrl = resolveIntegrationQueueUrl(process.env);
  const sqsConsumer = integrationQueueUrl
    ? new SqsConsumer({
        queueUrl: integrationQueueUrl,
        region: env.AWS_REGION,
        databaseUrl: env.DATABASE_URL,
        environment: env.APP_ENV,
      })
    : undefined;

  const reportingSchedulesQueueUrl = env.SQS_REPORTING_SCHEDULES_QUEUE_URL;
  const reportingSchedulesConsumer = reportingSchedulesQueueUrl
    ? new ReportingSchedulesSqsConsumer({
        queueUrl: reportingSchedulesQueueUrl,
        region: env.AWS_REGION,
        environment: env.APP_ENV,
        publicApiUrl: env.PUBLIC_API_URL,
        sweepToken: env.FORGE_REPORTING_SWEEP_TOKEN ?? "",
      })
    : undefined;

  const importQueueUrl = env.SQS_IMPORT_QUEUE_URL;
  const importConsumer = importQueueUrl
    ? new ImportSqsConsumer({
        queueUrl: importQueueUrl,
        region: env.AWS_REGION,
        databaseUrl: env.DATABASE_URL,
        environment: env.APP_ENV,
      })
    : undefined;

  if (env.APP_ENV) {
    logger.info("outbox publisher loop starting", { intervalMs: 2000 });
    const outboxTick = async () => {
      if (shuttingDown) return;
      try {
        const count = await publisher.pollOnce();
        if (count > 0) {
          logger.info("published outbox events", { count });
        }
      } catch (error) {
        logger.error("outbox poll failed", {
          error,
        });
      }
    };
    void outboxTick();
    outboxTimer = setInterval(() => void outboxTick(), 2000);

    if (sqsConsumer) {
      logger.info("sqs consumer loop starting", {
        intervalMs: 1000,
        queueUrl: integrationQueueUrl,
      });
      const sqsTick = async () => {
        if (shuttingDown) return;
        try {
          const count = await sqsConsumer.pollOnce();
          if (count > 0) {
            logger.info("processed sqs domain events", { count });
          }
        } catch (error) {
          logger.error("sqs poll failed", {
            error,
          });
        }
      };
      void sqsTick();
      sqsTimer = setInterval(() => void sqsTick(), 1000);
    } else {
      logger.warn("sqs consumer disabled: INTEGRATION_QUEUE_URL not configured");
    }

    if (reportingSchedulesConsumer) {
      logger.info("reporting schedules consumer loop starting", {
        intervalMs: 5000,
        queueUrl: reportingSchedulesQueueUrl,
      });
      const reportingTick = async () => {
        if (shuttingDown) return;
        try {
          const count = await reportingSchedulesConsumer.pollOnce();
          if (count > 0) {
            logger.info("processed reporting schedule sweeps", { count });
          }
        } catch (error) {
          logger.error("reporting schedules poll failed", {
            error,
          });
        }
      };
      void reportingTick();
      reportingSchedulesTimer = setInterval(() => void reportingTick(), 5000);
    }

    if (importConsumer) {
      logger.info("import queue consumer loop starting", {
        intervalMs: 1000,
        queueUrl: importQueueUrl,
      });
      const importTick = async () => {
        if (shuttingDown) return;
        try {
          const count = await importConsumer.pollOnce();
          if (count > 0) {
            logger.info("processed import queue messages", { count });
          }
        } catch (error) {
          logger.error("import queue poll failed", {
            error,
          });
        }
      };
      void importTick();
      importTimer = setInterval(() => void importTick(), 1000);
    }
  }

  logger.info("worker-service started", {
    handlers: [
      "outbox",
      sqsConsumer ? "integration-sqs" : null,
      reportingSchedulesConsumer ? "reporting-schedules" : null,
      importConsumer ? "import-queue" : null,
    ]
      .filter(Boolean)
      .join("+"),
  });

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("worker-service shutting down");
    if (outboxTimer) clearInterval(outboxTimer);
    if (sqsTimer) clearInterval(sqsTimer);
    if (reportingSchedulesTimer) clearInterval(reportingSchedulesTimer);
    if (importTimer) clearInterval(importTimer);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
