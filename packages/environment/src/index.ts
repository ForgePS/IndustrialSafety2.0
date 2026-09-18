import { z } from "zod";
import type { AppEnvironment, AwsPartition } from "@forge/shared-types";
import { awsAccountIdSchema, awsArnSchema, awsRegionSchema } from "@forge/validation";
import { buildDatabaseUrl, resolveDatabaseSecret } from "./database-secret.js";

const appEnvironments = [
  "local",
  "development",
  "testing",
  "staging",
  "production",
  "govcloud-development",
  "govcloud-staging",
  "govcloud-production",
] as const satisfies readonly AppEnvironment[];

const partitions = ["aws", "aws-us-gov"] as const satisfies readonly AwsPartition[];

const localLike = new Set<AppEnvironment>(["local", "development", "testing"]);

function isSecureUrl(value: string, env: AppEnvironment): boolean {
  try {
    const url = new URL(value);
    if (localLike.has(env)) {
      return url.protocol === "http:" || url.protocol === "https:";
    }
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(appEnvironments),
  APP_NAME: z.string().min(1),
  APP_VERSION: z.string().min(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  AWS_PARTITION: z.enum(partitions),
  AWS_REGION: awsRegionSchema,
  AWS_SECONDARY_REGION: awsRegionSchema,
  AWS_ACCOUNT_ID: awsAccountIdSchema,
  DATABASE_URL: z.string().min(1),
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().positive(),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USERNAME: z.string().min(1),
  DATABASE_SECRET_ARN: z.string().optional().default(""),
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_CLIENT_ID: z.string().min(1),
  COGNITO_DOMAIN: z.string().min(1),
  KMS_GENERAL_KEY_ARN: z.string().min(1),
  KMS_SENSITIVE_DATA_KEY_ARN: z.string().min(1),
  S3_DOCUMENT_BUCKET: z.string().min(1),
  S3_IMPORT_BUCKET: z.string().min(1),
  S3_EXPORT_BUCKET: z.string().min(1),
  S3_AUDIT_BUCKET: z.string().min(1),
  SQS_IMPORT_QUEUE_URL: z.string().url(),
  SQS_NOTIFICATION_QUEUE_URL: z.string().url(),
  SQS_CAD_INTAKE_QUEUE_URL: z.string().url().optional(),
  SQS_CAD_NORMALIZATION_QUEUE_URL: z.string().url().optional(),
  SQS_CAD_MATCHING_QUEUE_URL: z.string().url().optional(),
  SQS_CAD_APPLICATION_QUEUE_URL: z.string().url().optional(),
  SQS_CAD_POLLING_QUEUE_URL: z.string().url().optional(),
  SQS_CAD_RETENTION_QUEUE_URL: z.string().url().optional(),
  SQS_REPORTING_SCHEDULES_QUEUE_URL: z.string().url().optional(),
  /** Shared secret for worker → API reporting schedule run-due sweep. */
  FORGE_REPORTING_SWEEP_TOKEN: z.string().optional().default(""),
  /** Comma-separated tenant UUIDs eligible for scheduled CAD polling (synthetic only). */
  CAD_POLLING_TENANT_IDS: z.string().optional().default(""),
  /** Comma-separated tenant UUIDs eligible for scheduled CAD retention. */
  CAD_RETENTION_TENANT_IDS: z.string().optional().default(""),
  /** Local/dev map of connectionPublicId -> webhook secret. Never use in production. */
  CAD_WEBHOOK_SECRET_OVERRIDES_JSON: z.string().optional().default(""),
  CAD_WEBHOOK_MAX_BODY_BYTES: z.coerce.number().int().positive().optional().default(262144),
  /**
   * Optional platform defaults for Emergency Alerts AWS End User Messaging SMS.
   * Tenant settings can override. IAM authenticates sends — these are not API keys.
   */
  SMS_DEFAULT_PROVIDER: z.string().optional().default(""),
  SMS_ORIGINATION_IDENTITY: z.string().optional().default(""),
  SMS_CONFIGURATION_SET_NAME: z.string().optional().default(""),
  SMS_REGION: z.string().optional().default(""),
  SMS_DRY_RUN: z.string().optional().default(""),
  SMS_MAX_PRICE: z.string().optional().default(""),
  SMS_PROTECT_CONFIGURATION_ID: z.string().optional().default(""),
  /**
   * Outbound mail provider: noop (default local), ses, or resend.
   * Production Compute currently sets resend + Secrets Manager RESEND_API_KEY.
   */
  FORGE_EMAIL_PROVIDER: z.string().optional().default("noop"),
  SES_FROM_ADDRESS: z.string().min(3),
  /** Resend.com API key (ECS injects from Secrets Manager; never log). */
  RESEND_API_KEY: z.string().optional().default(""),
  /** Verified Resend from address; falls back to SES_FROM_ADDRESS when empty. */
  RESEND_FROM_ADDRESS: z.string().optional().default(""),
  PUBLIC_ACADEMY_URL: z.string().url(),
  PUBLIC_RMS_URL: z.string().url(),
  PUBLIC_CREATOR_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),
  FEATURE_FLAG_PROVIDER: z.string().min(1),
  CORS_ORIGINS: z.string().optional().default(""),
  /**
   * Comma-separated host suffixes trusted as browser origins over https, so
   * per-tenant vanity hosts do not each need an exact CORS entry and redeploy.
   */
  CORS_ORIGIN_SUFFIXES: z.string().optional().default(""),
  BODY_SIZE_LIMIT: z.string().optional().default("1mb"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().optional().default(30000),
  /**
   * Import malware scanner provider key.
   * Use `reference-malware` locally; production-like requires
   * `aws-guardduty-malware-protection` (or another approved non-reference key).
   */
  IMPORT_MALWARE_PROVIDER_KEY: z.string().min(1).optional().default("reference-malware"),
  /**
   * Base64-encoded 32-byte AES-256-GCM key for encrypting Cognito refresh tokens
   * in auth_browser_sessions. Required outside local/testing (see crypto helper).
   */
  FORGE_AUTH_SESSION_ENCRYPTION_KEY: z.string().optional().default(""),
  /** Idle session lifetime in seconds (default 12h). */
  FORGE_AUTH_SESSION_IDLE_SECONDS: z.coerce.number().int().positive().optional().default(43_200),
  /** Absolute session lifetime in seconds (default 24h). */
  FORGE_AUTH_SESSION_ABSOLUTE_SECONDS: z.coerce.number().int().positive().optional().default(86_400),
});

export type ForgeEnvironment = z.infer<typeof baseSchema>;

export function loadEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): ForgeEnvironment {
  const parsed = baseSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const env = parsed.data;
  const productionLike = !localLike.has(env.APP_ENV);

  if (productionLike) {
    if (!env.DATABASE_SECRET_ARN) {
      throw new Error("DATABASE_SECRET_ARN is required outside local/development/testing");
    }
    awsArnSchema.parse(env.DATABASE_SECRET_ARN);
    awsArnSchema.parse(env.KMS_GENERAL_KEY_ARN);
    awsArnSchema.parse(env.KMS_SENSITIVE_DATA_KEY_ARN);
  } else if (env.DATABASE_SECRET_ARN) {
    awsArnSchema.parse(env.DATABASE_SECRET_ARN);
  }

  if (env.AWS_PARTITION === "aws-us-gov" && !env.APP_ENV.startsWith("govcloud")) {
    throw new Error("aws-us-gov partition requires a govcloud-* APP_ENV");
  }

  for (const key of [
    "PUBLIC_ACADEMY_URL",
    "PUBLIC_RMS_URL",
    "PUBLIC_CREATOR_URL",
    "PUBLIC_API_URL",
  ] as const) {
    if (!isSecureUrl(env[key], env.APP_ENV)) {
      throw new Error(`${key} must use https in production-like environments`);
    }
  }

  return env;
}

export function getPublicEnv(env: ForgeEnvironment): Record<string, string> {
  return {
    APP_ENV: env.APP_ENV,
    APP_NAME: env.APP_NAME,
    APP_VERSION: env.APP_VERSION,
    PUBLIC_ACADEMY_URL: env.PUBLIC_ACADEMY_URL,
    PUBLIC_RMS_URL: env.PUBLIC_RMS_URL,
    PUBLIC_CREATOR_URL: env.PUBLIC_CREATOR_URL,
    PUBLIC_API_URL: env.PUBLIC_API_URL,
  };
}

export {
  buildDatabaseUrl,
  resolveDatabaseSecret,
  type RdsSecretFields,
} from "./database-secret.js";

/**
 * Loads env, optionally resolving Aurora credentials from Secrets Manager (ADR-011).
 */
export async function loadEnvironmentAsync(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<ForgeEnvironment> {
  const merged: Record<string, string | undefined> = { ...source };
  const secretArn = merged.DATABASE_SECRET_ARN;
  const region = merged.AWS_REGION || "us-east-1";

  if (secretArn) {
    const fields = await resolveDatabaseSecret(secretArn, region);
    if (fields) {
      merged.DATABASE_HOST = fields.host;
      merged.DATABASE_PORT = String(fields.port);
      merged.DATABASE_NAME = fields.dbname;
      merged.DATABASE_USERNAME = fields.username;
      merged.DATABASE_URL = buildDatabaseUrl(fields);
    }
  }

  return loadEnvironment(merged);
}

export const LOCAL_PLACEHOLDER_ENV: Record<string, string> = {
  NODE_ENV: "development",
  APP_ENV: "local",
  APP_NAME: "forge-platform",
  APP_VERSION: "0.1.0",
  LOG_LEVEL: "debug",
  AWS_PARTITION: "aws",
  AWS_REGION: "us-east-1",
  AWS_SECONDARY_REGION: "us-west-2",
  AWS_ACCOUNT_ID: "000000000000",
  DATABASE_URL: "postgresql://forge:forge_local_only@localhost:5432/forge_platform_local",
  DATABASE_HOST: "localhost",
  DATABASE_PORT: "5432",
  DATABASE_NAME: "forge_platform_local",
  DATABASE_USERNAME: "forge",
  DATABASE_SECRET_ARN: "",
  COGNITO_USER_POOL_ID: "local-pool",
  COGNITO_CLIENT_ID: "local-client",
  COGNITO_DOMAIN: "local.auth.example.com",
  KMS_GENERAL_KEY_ARN:
    "arn:aws:kms:us-east-1:000000000000:key/00000000-0000-0000-0000-000000000000",
  KMS_SENSITIVE_DATA_KEY_ARN:
    "arn:aws:kms:us-east-1:000000000000:key/11111111-1111-1111-1111-111111111111",
  S3_DOCUMENT_BUCKET: "forge-local-documents",
  S3_IMPORT_BUCKET: "forge-local-imports",
  S3_EXPORT_BUCKET: "forge-local-exports",
  S3_AUDIT_BUCKET: "forge-local-audit",
  SQS_IMPORT_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-import",
  SQS_NOTIFICATION_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-notification",
  SQS_CAD_INTAKE_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-cad-intake",
  SQS_CAD_NORMALIZATION_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-cad-normalization",
  SQS_CAD_MATCHING_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-cad-matching",
  SQS_CAD_APPLICATION_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-cad-application",
  SQS_CAD_POLLING_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-cad-polling",
  SQS_CAD_RETENTION_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-cad-retention",
  SQS_REPORTING_SCHEDULES_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-reporting-schedules",
  FORGE_REPORTING_SWEEP_TOKEN: "local-reporting-sweep-token",
  CAD_POLLING_TENANT_IDS: "",
  CAD_RETENTION_TENANT_IDS: "",
  SMS_DEFAULT_PROVIDER: "",
  SMS_ORIGINATION_IDENTITY: "",
  SMS_CONFIGURATION_SET_NAME: "",
  SMS_REGION: "",
  SMS_DRY_RUN: "",
  SMS_MAX_PRICE: "",
  SMS_PROTECT_CONFIGURATION_ID: "",
  INTEGRATION_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-integration-events",
  SQS_INTEGRATION_QUEUE_URL:
    "https://sqs.us-east-1.amazonaws.com/000000000000/forge-local-integration-events",
  EVENT_BUS_NAME: "forge-platform",
  FORGE_EMAIL_PROVIDER: "noop",
  SES_FROM_ADDRESS: "noreply@localhost.local",
  RESEND_API_KEY: "",
  RESEND_FROM_ADDRESS: "",
  PUBLIC_ACADEMY_URL: "http://localhost:3001",
  PUBLIC_RMS_URL: "http://localhost:3002",
  PUBLIC_CREATOR_URL: "http://localhost:3003",
  PUBLIC_API_URL: "http://localhost:4000",
  CORS_ORIGINS:
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005",
  FEATURE_FLAG_PROVIDER: "local",
  IMPORT_MALWARE_PROVIDER_KEY: "reference-malware",
};
