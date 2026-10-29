import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { createLogger } from "@forge/observability";
import { registerProofEventHandlers } from "./event-processing/proof-handlers.js";
import { CadIntakeSqsConsumer } from "./processors/cad-intake-consumer.js";
import { CadMatchSqsConsumer } from "./processors/cad-match-consumer.js";
import { CadPollingSqsConsumer } from "./processors/cad-polling-consumer.js";
import { CadRetentionSqsConsumer } from "./processors/cad-retention-consumer.js";
import { ImportSqsConsumer } from "./processors/import-upload-consumer.js";
import { ReportingSchedulesSqsConsumer } from "./processors/reporting-schedules-consumer.js";
import { OutboxPublisher, resolveEventBusName } from "./processors/outbox-publisher.js";
import { resolveIntegrationQueueUrl, SqsConsumer } from "./processors/sqs-consumer.js";

function parseTenantIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

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
  let cadTimer: ReturnType<typeof setInterval> | undefined;
  let cadMatchTimer: ReturnType<typeof setInterval> | undefined;
  let cadPollingTimer: ReturnType<typeof setInterval> | undefined;
  let cadRetentionTimer: ReturnType<typeof setInterval> | undefined;
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

  const cadIntakeQueueUrl = env.SQS_CAD_INTAKE_QUEUE_URL;
  const cadConsumer = cadIntakeQueueUrl
    ? new CadIntakeSqsConsumer({
        queueUrl: cadIntakeQueueUrl,
        region: env.AWS_REGION,
        databaseUrl: env.DATABASE_URL,
        environment: env.APP_ENV,
        ...(env.S3_DOCUMENT_BUCKET ? { documentBucket: env.S3_DOCUMENT_BUCKET } : {}),
        ...(env.SQS_CAD_MATCHING_QUEUE_URL
          ? { normalizationQueueUrl: env.SQS_CAD_MATCHING_QUEUE_URL }
          : {}),
      })
    : undefined;

  const cadMatchQueueUrl = env.SQS_CAD_MATCHING_QUEUE_URL;
  const cadMatchConsumer = cadMatchQueueUrl
    ? new CadMatchSqsConsumer({
        queueUrl: cadMatchQueueUrl,
        region: env.AWS_REGION,
        databaseUrl: env.DATABASE_URL,
        environment: env.APP_ENV,
        ...(env.SQS_CAD_APPLICATION_QUEUE_URL
          ? { applicationQueueUrl: env.SQS_CAD_APPLICATION_QUEUE_URL }
          : {}),
      })
    : undefined;

  const cadPollingQueueUrl = env.SQS_CAD_POLLING_QUEUE_URL;
  const cadPollingConsumer =
    cadPollingQueueUrl && cadIntakeQueueUrl
      ? new CadPollingSqsConsumer({
          queueUrl: cadPollingQueueUrl,
          region: env.AWS_REGION,
          databaseUrl: env.DATABASE_URL,
          environment: env.APP_ENV,
          intakeQueueUrl: cadIntakeQueueUrl,
          pollingTenantIds: parseTenantIds(env.CAD_POLLING_TENANT_IDS),
        })
      : undefined;

  const cadRetentionQueueUrl = env.SQS_CAD_RETENTION_QUEUE_URL;
  const cadRetentionConsumer = cadRetentionQueueUrl
    ? new CadRetentionSqsConsumer({
        queueUrl: cadRetentionQueueUrl,
        region: env.AWS_REGION,
        databaseUrl: env.DATABASE_URL,
        environment: env.APP_ENV,
        retentionTenantIds: parseTenantIds(env.CAD_RETENTION_TENANT_IDS),
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

    if (cadConsumer) {
      logger.info("cad intake consumer loop starting", {
        intervalMs: 1000,
        queueUrl: cadIntakeQueueUrl,
      });
      const cadTick = async () => {
        if (shuttingDown) return;
        try {
          const count = await cadConsumer.pollOnce();
          if (count > 0) {
            logger.info("processed cad intake messages", { count });
          }
        } catch (error) {
          logger.error("cad intake poll failed", {
            error,
          });
        }
      };
      void cadTick();
      cadTimer = setInterval(() => void cadTick(), 1000);
    }

    if (cadMatchConsumer) {
      logger.info("cad match consumer loop starting", {
        intervalMs: 1000,
        queueUrl: cadMatchQueueUrl,
      });
      const matchTick = async () => {
        if (shuttingDown) return;
        try {
          const count = await cadMatchConsumer.pollOnce();
          if (count > 0) {
            logger.info("processed cad match messages", { count });
          }
        } catch (error) {
          logger.error("cad match poll failed", {
            error,
          });
        }
      };
      void matchTick();
      cadMatchTimer = setInterval(() => void matchTick(), 1000);
    }

    if (cadPollingConsumer) {
      logger.info("cad polling consumer loop starting", {
        intervalMs: 2000,
        queueUrl: cadPollingQueueUrl,
      });
      const pollingTick = async () => {
        if (shuttingDown) return;
        try {
          const count = await cadPollingConsumer.pollOnce();
          if (count > 0) {
            logger.info("processed cad polling ticks", { count });
          }
        } catch (error) {
          logger.error("cad polling poll failed", {
            error,
          });
        }
      };
      void pollingTick();
      cadPollingTimer = setInterval(() => void pollingTick(), 2000);
    }

    if (cadRetentionConsumer) {
      logger.info("cad retention consumer loop starting", {
        intervalMs: 5000,
        queueUrl: cadRetentionQueueUrl,
      });
      const retentionTick = async () => {
        if (shuttingDown) return;
        try {
          const count = await cadRetentionConsumer.pollOnce();
          if (count > 0) {
            logger.info("processed cad retention runs", { count });
          }
        } catch (error) {
          logger.error("cad retention poll failed", {
            error,
          });
        }
      };
      void retentionTick();
      cadRetentionTimer = setInterval(() => void retentionTick(), 5000);
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
      cadConsumer ? "cad-intake" : null,
      cadMatchConsumer ? "cad-match" : null,
      cadPollingConsumer ? "cad-polling" : null,
      cadRetentionConsumer ? "cad-retention" : null,
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
    if (cadTimer) clearInterval(cadTimer);
    if (cadMatchTimer) clearInterval(cadMatchTimer);
    if (cadPollingTimer) clearInterval(cadPollingTimer);
    if (cadRetentionTimer) clearInterval(cadRetentionTimer);
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
