import { z } from "zod";

export const environmentNameSchema = z.enum([
  "development",
  "testing",
  "staging",
  "production",
  "govcloud-development",
  "govcloud-staging",
  "govcloud-production",
]);

export const partitionSchema = z.enum(["aws", "aws-us-gov"]);

/** Named cost presets: developer (~$50–80), integration (~$100–150), production (workload-sized). */
export const costProfileSchema = z.enum(["developer", "integration", "production"]);

export const forgeEnvironmentConfigSchema = z
  .object({
    environmentName: environmentNameSchema,
    /** Cost profile controlling capacity, retention, and feature toggles. */
    costProfile: costProfileSchema,
    partition: partitionSchema,
    account: z.string().regex(/^\d{12}$/, "AWS account ID must be 12 digits"),
    region: z.string().regex(/^[a-z]{2}(?:-[a-z]+)+-\d+$/),
    secondaryRegion: z
      .string()
      .regex(/^[a-z]{2}(?:-[a-z]+)+-\d+$/)
      .optional(),
    projectName: z.literal("forge-platform"),
    networking: z.object({
      vpcCidr: z.string().min(1),
      availabilityZoneCount: z.number().int().min(2).max(3),
      natGatewayCount: z.number().int().min(0).max(3),
      enableVpcFlowLogs: z.boolean(),
      /** S3 is materially cheaper than CloudWatch Logs for high-volume flow logs. */
      flowLogDestination: z.enum(["cloudwatch", "s3"]).default("cloudwatch"),
      enableInterfaceEndpoints: z.boolean().default(false),
    }),
    database: z.object({
      engineVersion: z.string().min(1),
      /** 0 enables Aurora Serverless v2 auto-pause; otherwise the floor is 0.5 ACU. */
      serverlessMinCapacity: z.number().min(0),
      serverlessMaxCapacity: z.number().positive(),
      /** Idle time before an auto-pause-eligible instance pauses. */
      autoPauseMinutes: z.number().int().min(5).max(1440).optional(),
      backupRetentionDays: z.number().int().min(1).max(35),
      deletionProtection: z.boolean(),
      multiAz: z.boolean(),
      /**
       * GAP-009: When true, reference the existing forge_app Secrets Manager secret
       * by name (`fromSecretNameV2`) instead of creating `AppDbSecret`.
       * Use for environments where the application secret already exists outside
       * CloudFormation ownership. Never flip from create→import on a stack that
       * already owns the secret without an approved import plan (would delete).
       */
      importExistingAppSecret: z.boolean().default(false),
    }),
    retention: z.object({
      applicationLogsDays: z.number().int().positive(),
      securityLogsDays: z.number().int().positive(),
      auditLogsDays: z.number().int().positive(),
      importFilesDays: z.number().int().positive(),
      exportFilesDays: z.number().int().positive(),
    }),
    domains: z
      .object({
        academy: z.string().optional(),
        rms: z.string().optional(),
        creator: z.string().optional(),
        api: z.string().optional(),
        industrial: z.string().optional(),
        tenantAdmin: z.string().optional(),
        /** Forge Field mobile PWA hostname (optional until DNS cutover). */
        field: z.string().optional(),
        /** Verified SES sending domain (no secrets). */
        ses: z.string().optional(),
      })
      .optional(),
    /**
     * Edge TLS and DNS (ADR-025). Disabled by default so development can stay
     * on HTTP until a hosted zone is delegated. When enableHttps is true,
     * either certificateArn or hostedZoneId+apiHostname must be provided.
     */
    edge: z
      .object({
        enableHttps: z.boolean().default(false),
        hostedZoneId: z.string().min(1).optional(),
        certificateArn: z.string().min(1).optional(),
        apiHostname: z.string().min(1).optional(),
        consoleHostname: z.string().min(1).optional(),
      })
      .default({ enableHttps: false }),
    compute: z.object({
      apiDesiredCount: z.number().int().min(0).max(10),
      workerDesiredCount: z.number().int().min(0).max(10),
    }),
    features: z.object({
      enableWaf: z.boolean(),
      enableMacie: z.boolean(),
      enableGuardDuty: z.boolean(),
      enableSecurityHub: z.boolean(),
      enableInspector: z.boolean(),
      enableBackup: z.boolean(),
      enableBudget: z.boolean(),
      /**
       * Account-level CloudTrail (SOC 2 CC-LOG-01). Inspect OD-21 before enabling
       * when organization trails may already exist.
       */
      enableCloudTrail: z.boolean().default(false),
      /** CloudFront + S3 static hosting for Creator Console (ADR-026). */
      enableConsoleHosting: z.boolean().default(true),
      /** CloudFront + S3 static hosting for RMS Web (NERIS Phase 2). */
      enableRmsHosting: z.boolean().default(true),
      /** CloudFront + S3 static hosting for Tenant Admin (Configuration Platform). */
      enableTenantAdminHosting: z.boolean().default(true),
      /** CloudFront + S3 static hosting for Forge Field mobile PWA. */
      enableFieldHosting: z.boolean().default(false),
      monthlyBudgetUsd: z.number().positive().optional(),
      /** Budget alert thresholds as percentages of monthlyBudgetUsd. */
      budgetAlertThresholds: z.array(z.number().positive()).default([50, 80, 100, 120]),
    }),
    cognito: z.object({
      callbackUrls: z.array(z.string().url()).min(1),
      logoutUrls: z.array(z.string().url()).min(1),
      selfSignUpEnabled: z.boolean(),
    }),
  })
  .superRefine((value, ctx) => {
    const isGov = value.environmentName.startsWith("govcloud");
    if (isGov && value.partition !== "aws-us-gov") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GovCloud environments must use aws-us-gov partition",
      });
    }
    if (!isGov && value.partition !== "aws") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Commercial environments must use aws partition",
      });
    }
    if (value.environmentName === "production" || value.environmentName === "govcloud-production") {
      if (!value.database.deletionProtection) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Production environments must enable database deletion protection",
        });
      }
      if (value.account === "000000000000") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["account"],
          message: "Production account must not use the 000000000000 placeholder",
        });
      }
      const requiredDomainKeys = ["api", "creator", "rms", "industrial", "tenantAdmin"] as const;
      for (const key of requiredDomainKeys) {
        const host = value.domains?.[key];
        if (!host || host.includes("example.com")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["domains", key],
            message: `Production domains.${key} must be an explicit non-example hostname`,
          });
        }
      }
      for (const url of [...value.cognito.callbackUrls, ...value.cognito.logoutUrls]) {
        if (url.includes("example.com") || url.startsWith("http://localhost")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["cognito"],
            message:
              "Production Cognito URLs must be HTTPS production hosts (no example.com / localhost)",
          });
          break;
        }
      }
    }
    if (value.database.serverlessMaxCapacity < value.database.serverlessMinCapacity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "database.serverlessMaxCapacity must be >= serverlessMinCapacity",
      });
    }
    if (value.database.serverlessMinCapacity > 0 && value.database.serverlessMinCapacity < 0.5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "database.serverlessMinCapacity must be 0 (auto-pause) or at least 0.5 ACU",
      });
    }
    if (
      value.database.autoPauseMinutes !== undefined &&
      value.database.serverlessMinCapacity !== 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "database.autoPauseMinutes requires serverlessMinCapacity of 0",
      });
    }
    if (
      value.database.serverlessMinCapacity === 0 &&
      (value.environmentName === "production" || value.environmentName === "govcloud-production")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production environments must not enable database auto-pause",
      });
    }
    for (const url of [...value.cognito.callbackUrls, ...value.cognito.logoutUrls]) {
      if (url.includes("*")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cognito callback/logout URLs must not contain wildcards",
        });
      }
    }
    if (value.edge.enableHttps) {
      const hasCert = Boolean(value.edge.certificateArn);
      const hasDns = Boolean(value.edge.hostedZoneId && value.edge.apiHostname);
      if (!hasCert && !hasDns) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "edge.enableHttps requires certificateArn or hostedZoneId with apiHostname",
          path: ["edge"],
        });
      }
    }
  });

export type ForgeEnvironmentConfig = z.infer<typeof forgeEnvironmentConfigSchema>;

export function validateEnvironmentConfig(input: unknown): ForgeEnvironmentConfig {
  return forgeEnvironmentConfigSchema.parse(input);
}
