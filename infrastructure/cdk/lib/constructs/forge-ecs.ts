import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as events from "aws-cdk-lib/aws-events";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";
import { ForgeApiCloudFront } from "./forge-api-cloudfront.js";
import { ForgeEdgeTls } from "./forge-edge-tls.js";
import { ForgeWafLogging } from "./forge-waf-logging.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");

const ASSET_EXCLUDES = [
  "**/node_modules",
  "**/dist",
  "**/.turbo",
  "**/cdk.out",
  ".git",
  "apps/academy-web",
  "apps/rms-web",
  "apps/creator-console",
  "docs",
  "migration",
  "tests",
];

export interface ForgeEcsProps {
  config: ForgeEnvironmentConfig;
  vpc: ec2.IVpc;
  albSecurityGroup: ec2.ISecurityGroup;
  apiSecurityGroup: ec2.ISecurityGroup;
  workerSecurityGroup: ec2.ISecurityGroup;
  platformApiRepo: ecr.IRepository;
  workerRepo: ecr.IRepository;
  databaseSecret: secretsmanager.ISecret;
  /** Runtime DB secret for API/worker (`forge_app`). Falls back to databaseSecret when omitted. */
  appDatabaseSecret?: secretsmanager.ISecret;
  importQueue: sqs.IQueue;
  notificationQueue: sqs.IQueue;
  documentQueue: sqs.IQueue;
  integrationQueue: sqs.IQueue;
  cadIntakeQueue: sqs.IQueue;
  cadNormalizationQueue: sqs.IQueue;
  cadMatchingQueue: sqs.IQueue;
  cadApplicationQueue: sqs.IQueue;
  cadPollingQueue: sqs.IQueue;
  cadRetentionQueue: sqs.IQueue;
  eventBus: events.IEventBus;
  documentsBucket: s3.IBucket;
  importsBucket: s3.IBucket;
  exportsBucket: s3.IBucket;
  apiLogGroup: logs.ILogGroup;
  workerLogGroup: logs.ILogGroup;
  enableWaf: boolean;
  cognitoUserPoolId: string;
  cognitoClientIds: string;
  cognitoDomain: string;
  browserOrigins: string[];
  /**
   * Host suffixes trusted as https browser origins (leading-dot form optional).
   * Used so per-tenant vanity hosts do not each require an exact CORS redeploy.
   */
  browserOriginSuffixes?: string[];
  publicRmsUrl: string;
  publicCreatorUrl: string;
  /** Optional override; when omitted, set from ApiHttps CloudFront domain. */
  publicApiUrl?: string;
}

export class ForgeEcs extends Construct {
  readonly cluster: ecs.Cluster;
  readonly alb: elbv2.ApplicationLoadBalancer;
  readonly apiService: ecs.FargateService;
  readonly workerService: ecs.FargateService;
  readonly apiTargetGroup: elbv2.ApplicationTargetGroup;
  readonly webAcl?: wafv2.CfnWebACL;
  readonly edgeTls?: ForgeEdgeTls;
  readonly apiHttps: ForgeApiCloudFront;

  constructor(scope: Construct, id: string, props: ForgeEcsProps) {
    super(scope, id);
    const { config, vpc } = props;
    const runtimeDbSecret = props.appDatabaseSecret ?? props.databaseSecret;

    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: resourceName(config, "ecs", "platform"),
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const retain =
      config.environmentName.includes("production") ||
      config.environmentName.startsWith("govcloud");

    const albLogsBucket = new s3.Bucket(this, "AlbAccessLogs", {
      bucketName: `forge-${config.environmentName}-alb-logs-${config.account}-${config.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
      removalPolicy: retain ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !retain,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    this.alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      loadBalancerName: resourceName(config, "alb", "api").slice(0, 32),
    });
    this.alb.logAccessLogs(albLogsBucket);

    this.apiTargetGroup = new elbv2.ApplicationTargetGroup(this, "ApiTg", {
      vpc,
      port: 4000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200",
        interval: cdk.Duration.seconds(30),
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // HTTP forward when TLS is off; HTTP->HTTPS redirect when edge.enableHttps.
    if (config.edge.enableHttps) {
      this.edgeTls = new ForgeEdgeTls(this, "EdgeTls", {
        config,
        alb: this.alb,
        apiTargetGroup: this.apiTargetGroup,
      });
    } else {
      this.alb.addListener("Http", {
        port: 80,
        open: true,
        defaultTargetGroups: [this.apiTargetGroup],
      });
    }

    this.apiHttps = new ForgeApiCloudFront(this, "ApiHttps", {
      config,
      alb: this.alb,
      allowedBrowserOrigins: props.browserOrigins,
      allowedBrowserOriginSuffixes: props.browserOriginSuffixes ?? [],
    });
    const publicApiUrl = props.publicApiUrl ?? `https://${this.apiHttps.distribution.distributionDomainName}`;

    if (props.enableWaf) {
      this.webAcl = new wafv2.CfnWebACL(this, "AlbWebAcl", {
        name: resourceName(config, "waf", "alb"),
        scope: "REGIONAL",
        defaultAction: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: resourceName(config, "waf", "alb"),
          sampledRequestsEnabled: true,
        },
        rules: [
          {
            name: "AWSManagedRulesAmazonIpReputationList",
            priority: 0,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: "AWS",
                name: "AWSManagedRulesAmazonIpReputationList",
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "IpReputation",
              sampledRequestsEnabled: true,
            },
          },
          {
            name: "AWSManagedRulesCommonRuleSet",
            priority: 1,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: "AWS",
                name: "AWSManagedRulesCommonRuleSet",
                ruleActionOverrides: [
                  { name: "SizeRestrictions_BODY", actionToUse: { count: {} } },
                  { name: "CrossSiteScripting_BODY", actionToUse: { count: {} } },
                ],
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "CommonRuleSet",
              sampledRequestsEnabled: true,
            },
          },
          {
            name: "AWSManagedRulesKnownBadInputsRuleSet",
            priority: 2,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: "AWS",
                name: "AWSManagedRulesKnownBadInputsRuleSet",
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "KnownBadInputs",
              sampledRequestsEnabled: true,
            },
          },
          {
            // Conservative edge rate limit — associates only when Compute deploys ALB WAF.
            name: "RateLimitPerIp",
            priority: 3,
            action: { block: {} },
            statement: {
              rateBasedStatement: {
                limit: 2000,
                aggregateKeyType: "IP",
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "RateLimitPerIp",
              sampledRequestsEnabled: true,
            },
          },
        ],
      });
      new wafv2.CfnWebACLAssociation(this, "AlbWebAclAssoc", {
        resourceArn: this.alb.loadBalancerArn,
        webAclArn: this.webAcl.attrArn,
      });
      new ForgeWafLogging(this, "AlbWafLogging", {
        config,
        webAcl: this.webAcl,
        destinationSuffix: "alb",
        // Production ALB WAF logging was enabled during PROD-S1C before this
        // construct entered the stack; adopt to avoid AlreadyExists on deploy.
        adoptExisting: config.environmentName === "production",
      });
    }

    const apiExecutionRole = new iam.Role(this, "ApiExecutionRole", {
      roleName: resourceName(config, "iam", "api-exec"),
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });
    props.databaseSecret.grantRead(apiExecutionRole);
    runtimeDbSecret.grantRead(apiExecutionRole);

    const apiTaskRole = new iam.Role(this, "ApiTaskRole", {
      roleName: resourceName(config, "iam", "api-task"),
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    props.databaseSecret.grantRead(apiTaskRole);
    runtimeDbSecret.grantRead(apiTaskRole);
    props.documentsBucket.grantReadWrite(apiTaskRole);
    props.importsBucket.grantReadWrite(apiTaskRole);
    props.exportsBucket.grantReadWrite(apiTaskRole);
    props.importQueue.grantSendMessages(apiTaskRole);
    props.notificationQueue.grantSendMessages(apiTaskRole);
    props.documentQueue.grantSendMessages(apiTaskRole);
    props.integrationQueue.grantSendMessages(apiTaskRole);
    props.cadIntakeQueue.grantSendMessages(apiTaskRole);
    props.cadNormalizationQueue.grantSendMessages(apiTaskRole);
    props.cadMatchingQueue.grantSendMessages(apiTaskRole);
    props.cadApplicationQueue.grantSendMessages(apiTaskRole);
    props.cadPollingQueue.grantSendMessages(apiTaskRole);
    props.cadRetentionQueue.grantSendMessages(apiTaskRole);
    apiTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "secretsmanager",
            resource: "secret",
            resourceName: `forge-${config.environmentName}-cad-*`,
            arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
          }),
        ],
      }),
    );
    apiTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CognitoUserAdmin",
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminResetUserPassword",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminUserGlobalSignOut",
        ],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "cognito-idp",
            resource: "userpool",
            resourceName: props.cognitoUserPoolId,
            arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
          }),
        ],
      }),
    );

    const workerExecutionRole = new iam.Role(this, "WorkerExecutionRole", {
      roleName: resourceName(config, "iam", "worker-exec"),
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });

    const workerTaskRole = new iam.Role(this, "WorkerTaskRole", {
      roleName: resourceName(config, "iam", "worker-task"),
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    props.databaseSecret.grantRead(workerTaskRole);
    runtimeDbSecret.grantRead(workerTaskRole);
    props.importQueue.grantConsumeMessages(workerTaskRole);
    // DEF-S8-023: worker must SendMessage on the imports queue to chain
    // malware CLEAN → import.upload.detect.v1 (same-queue stage handoff).
    props.importQueue.grantSendMessages(workerTaskRole);
    props.notificationQueue.grantConsumeMessages(workerTaskRole);
    props.documentQueue.grantConsumeMessages(workerTaskRole);
    props.integrationQueue.grantConsumeMessages(workerTaskRole);
    props.cadIntakeQueue.grantConsumeMessages(workerTaskRole);
    props.cadNormalizationQueue.grantConsumeMessages(workerTaskRole);
    props.cadMatchingQueue.grantConsumeMessages(workerTaskRole);
    props.cadApplicationQueue.grantConsumeMessages(workerTaskRole);
    props.cadPollingQueue.grantConsumeMessages(workerTaskRole);
    props.cadRetentionQueue.grantConsumeMessages(workerTaskRole);
    props.cadIntakeQueue.grantSendMessages(workerTaskRole);
    props.cadNormalizationQueue.grantSendMessages(workerTaskRole);
    props.cadMatchingQueue.grantSendMessages(workerTaskRole);
    props.cadApplicationQueue.grantSendMessages(workerTaskRole);
    props.documentsBucket.grantReadWrite(workerTaskRole);
    props.importsBucket.grantReadWrite(workerTaskRole);
    props.exportsBucket.grantReadWrite(workerTaskRole);
    props.eventBus.grantPutEventsTo(workerTaskRole);

    const migrationRole = new iam.Role(this, "MigrationTaskRole", {
      roleName: resourceName(config, "iam", "migration-task"),
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    props.databaseSecret.grantRead(migrationRole);
    void migrationRole;
    void props.platformApiRepo;
    void props.workerRepo;

    const apiTaskDef = new ecs.FargateTaskDefinition(this, "ApiTaskDef", {
      family: resourceName(config, "ecs", "platform-api"),
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: apiExecutionRole,
      taskRole: apiTaskRole,
    });

    const apiImage = ecs.ContainerImage.fromAsset(repoRoot, {
      file: "apps/platform-api/Dockerfile",
      exclude: ASSET_EXCLUDES,
    });

    apiTaskDef.addContainer("platform-api", {
      image: apiImage,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "platform-api",
        logGroup: props.apiLogGroup,
      }),
      portMappings: [{ containerPort: 4000 }],
      environment: {
        APP_ENV: config.environmentName,
        APP_NAME: "platform-api",
        APP_VERSION: "0.1.0",
        AWS_PARTITION: config.partition,
        AWS_REGION: config.region,
        AWS_ACCOUNT_ID: config.account,
        PORT: "4000",
        NODE_ENV: "production",
        DATABASE_SECRET_ARN: runtimeDbSecret.secretArn,
        S3_DOCUMENT_BUCKET: props.documentsBucket.bucketName,
        S3_IMPORT_BUCKET: props.importsBucket.bucketName,
        S3_EXPORT_BUCKET: props.exportsBucket.bucketName,
        SQS_IMPORT_QUEUE_URL: props.importQueue.queueUrl,
        SQS_NOTIFICATION_QUEUE_URL: props.notificationQueue.queueUrl,
        SQS_CAD_INTAKE_QUEUE_URL: props.cadIntakeQueue.queueUrl,
        SQS_CAD_NORMALIZATION_QUEUE_URL: props.cadNormalizationQueue.queueUrl,
        SQS_CAD_MATCHING_QUEUE_URL: props.cadMatchingQueue.queueUrl,
        SQS_CAD_APPLICATION_QUEUE_URL: props.cadApplicationQueue.queueUrl,
        SQS_CAD_POLLING_QUEUE_URL: props.cadPollingQueue.queueUrl,
        SQS_CAD_RETENTION_QUEUE_URL: props.cadRetentionQueue.queueUrl,
        COGNITO_USER_POOL_ID: props.cognitoUserPoolId,
        COGNITO_CLIENT_ID: props.cognitoClientIds,
        COGNITO_DOMAIN: props.cognitoDomain,
        CORS_ORIGINS: props.browserOrigins.join(","),
        CORS_ORIGIN_SUFFIXES: (props.browserOriginSuffixes ?? []).join(","),
        PUBLIC_RMS_URL: props.publicRmsUrl,
        PUBLIC_CREATOR_URL: props.publicCreatorUrl,
        PUBLIC_ACADEMY_URL: props.publicRmsUrl,
        PUBLIC_API_URL: publicApiUrl,
      },
      healthCheck: {
        command: ["CMD-SHELL", "wget -qO- http://127.0.0.1:4000/health || exit 1"],
        interval: cdk.Duration.seconds(30),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    this.apiService = new ecs.FargateService(this, "ApiService", {
      cluster: this.cluster,
      serviceName: resourceName(config, "ecs", "platform-api"),
      taskDefinition: apiTaskDef,
      desiredCount: config.compute.apiDesiredCount,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      assignPublicIp: false,
      securityGroups: [props.apiSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(90),
    });
    this.apiService.attachToApplicationTargetGroup(this.apiTargetGroup);

    const scaling = this.apiService.autoScaleTaskCount({
      minCapacity: Math.max(1, config.compute.apiDesiredCount),
      maxCapacity: Math.max(2, config.compute.apiDesiredCount * 2),
    });
    scaling.scaleOnCpuUtilization("ApiCpuScaling", {
      targetUtilizationPercent: 70,
    });

    const workerTaskDef = new ecs.FargateTaskDefinition(this, "WorkerTaskDef", {
      family: resourceName(config, "ecs", "worker-service"),
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: workerExecutionRole,
      taskRole: workerTaskRole,
    });

    const workerImage = ecs.ContainerImage.fromAsset(repoRoot, {
      file: "apps/worker-service/Dockerfile",
      exclude: ASSET_EXCLUDES,
    });

    workerTaskDef.addContainer("worker-service", {
      image: workerImage,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "worker-service",
        logGroup: props.workerLogGroup,
      }),
      environment: {
        APP_ENV: config.environmentName,
        APP_NAME: "worker-service",
        APP_VERSION: "0.1.0",
        AWS_PARTITION: config.partition,
        AWS_REGION: config.region,
        AWS_ACCOUNT_ID: config.account,
        NODE_ENV: "production",
        DATABASE_SECRET_ARN: runtimeDbSecret.secretArn,
        IMPORT_QUEUE_URL: props.importQueue.queueUrl,
        NOTIFICATION_QUEUE_URL: props.notificationQueue.queueUrl,
        DOCUMENT_QUEUE_URL: props.documentQueue.queueUrl,
        INTEGRATION_QUEUE_URL: props.integrationQueue.queueUrl,
        SQS_IMPORT_QUEUE_URL: props.importQueue.queueUrl,
        SQS_NOTIFICATION_QUEUE_URL: props.notificationQueue.queueUrl,
        SQS_CAD_INTAKE_QUEUE_URL: props.cadIntakeQueue.queueUrl,
        SQS_CAD_NORMALIZATION_QUEUE_URL: props.cadNormalizationQueue.queueUrl,
        SQS_CAD_MATCHING_QUEUE_URL: props.cadMatchingQueue.queueUrl,
        SQS_CAD_APPLICATION_QUEUE_URL: props.cadApplicationQueue.queueUrl,
        SQS_CAD_POLLING_QUEUE_URL: props.cadPollingQueue.queueUrl,
        SQS_CAD_RETENTION_QUEUE_URL: props.cadRetentionQueue.queueUrl,
        // Development-only synthetic CAD tenant. Production must stay empty until
        // a real customer CAD connection is authorized (greenfield = skip ticks).
        CAD_POLLING_TENANT_IDS:
          config.environmentName === "development"
            ? "019f9e06-a0b2-75f4-9e0b-5ae9befd8193"
            : "",
        CAD_RETENTION_TENANT_IDS:
          config.environmentName === "development"
            ? "019f9e06-a0b2-75f4-9e0b-5ae9befd8193"
            : "",
        EVENT_BUS_NAME: props.eventBus.eventBusName,
        S3_DOCUMENT_BUCKET: props.documentsBucket.bucketName,
        S3_IMPORT_BUCKET: props.importsBucket.bucketName,
        // Required by @forge/environment HTTPS URL checks in production-like APP_ENV.
        PUBLIC_RMS_URL: props.publicRmsUrl,
        PUBLIC_CREATOR_URL: props.publicCreatorUrl,
        PUBLIC_ACADEMY_URL: props.publicRmsUrl,
        PUBLIC_API_URL: publicApiUrl,
      },
    });

    this.workerService = new ecs.FargateService(this, "WorkerService", {
      cluster: this.cluster,
      serviceName: resourceName(config, "ecs", "worker-service"),
      taskDefinition: workerTaskDef,
      desiredCount: config.compute.workerDesiredCount,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      assignPublicIp: false,
      securityGroups: [props.workerSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
    });
  }
}
