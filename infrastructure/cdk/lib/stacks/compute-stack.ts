import * as cdk from "aws-cdk-lib";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeEcr } from "../constructs/forge-ecr.js";
import { ForgeEcs } from "../constructs/forge-ecs.js";
import { resourceName, stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface ComputeStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
  vpc: ec2.IVpc;
  albSecurityGroup: ec2.ISecurityGroup;
  apiSecurityGroup: ec2.ISecurityGroup;
  workerSecurityGroup: ec2.ISecurityGroup;
  databaseSecret: secretsmanager.ISecret;
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
  cognitoUserPoolId: string;
  cognitoClientIds: string;
  cognitoDomain: string;
  browserOrigins: string[];
  /** Host suffixes for per-tenant vanity https origins (e.g. .forgepublicsafety.com). */
  browserOriginSuffixes?: string[];
  publicRmsUrl: string;
  publicCreatorUrl: string;
}

export class ComputeStack extends cdk.Stack {
  readonly ecr: ForgeEcr;
  readonly ecs: ForgeEcs;
  readonly cluster: ecs.Cluster;
  readonly alb: elbv2.ApplicationLoadBalancer;
  readonly apiService: ecs.FargateService;
  readonly workerService: ecs.FargateService;
  readonly apiTargetGroup: elbv2.ApplicationTargetGroup;
  readonly platformApiRepo: ecr.Repository;
  readonly apiHttpsDomainName: string;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Compute"),
    });

    this.ecr = new ForgeEcr(this, "Ecr", { config: props.config });
    this.platformApiRepo = this.ecr.platformApi;

    // GAP-009: Prefer an in-stack name lookup for the existing forge_app secret so
    // Compute can deploy without a Data-stack AppDbSecret export (secret already exists).
    const appDatabaseSecret =
      props.appDatabaseSecret ??
      secretsmanager.Secret.fromSecretNameV2(
        this,
        "AppDbSecretLookup",
        resourceName(props.config, "secrets", "database-app"),
      );

    this.ecs = new ForgeEcs(this, "Ecs", {
      config: props.config,
      vpc: props.vpc,
      albSecurityGroup: props.albSecurityGroup,
      apiSecurityGroup: props.apiSecurityGroup,
      workerSecurityGroup: props.workerSecurityGroup,
      platformApiRepo: this.ecr.platformApi,
      workerRepo: this.ecr.workerService,
      databaseSecret: props.databaseSecret,
      appDatabaseSecret,
      importQueue: props.importQueue,
      notificationQueue: props.notificationQueue,
      documentQueue: props.documentQueue,
      integrationQueue: props.integrationQueue,
      cadIntakeQueue: props.cadIntakeQueue,
      cadNormalizationQueue: props.cadNormalizationQueue,
      cadMatchingQueue: props.cadMatchingQueue,
      cadApplicationQueue: props.cadApplicationQueue,
      cadPollingQueue: props.cadPollingQueue,
      cadRetentionQueue: props.cadRetentionQueue,
      eventBus: props.eventBus,
      documentsBucket: props.documentsBucket,
      importsBucket: props.importsBucket,
      exportsBucket: props.exportsBucket,
      apiLogGroup: props.apiLogGroup,
      workerLogGroup: props.workerLogGroup,
      enableWaf: props.config.features.enableWaf,
      cognitoUserPoolId: props.cognitoUserPoolId,
      cognitoClientIds: props.cognitoClientIds,
      cognitoDomain: props.cognitoDomain,
      browserOrigins: props.browserOrigins,
      browserOriginSuffixes: props.browserOriginSuffixes,
      publicRmsUrl: props.publicRmsUrl,
      publicCreatorUrl: props.publicCreatorUrl,
    });

    this.cluster = this.ecs.cluster;
    this.alb = this.ecs.alb;
    this.apiService = this.ecs.apiService;
    this.workerService = this.ecs.workerService;
    this.apiTargetGroup = this.ecs.apiTargetGroup;
    this.apiHttpsDomainName = this.ecs.apiHttps.distribution.distributionDomainName;

    exportValue(
      this,
      `${id}-AlbDns`,
      this.alb.loadBalancerDnsName,
      "ALB DNS name (origin only — browsers use ApiHttpsDomain)",
    );
    exportValue(this, `${id}-ClusterName`, this.cluster.clusterName, "ECS cluster name");
    exportValue(
      this,
      `${id}-ApiHttpsDomain`,
      this.apiHttpsDomainName,
      "HTTPS CloudFront domain for Platform API",
    );
    exportValue(
      this,
      `${id}-ApiHttpsDistributionId`,
      this.ecs.apiHttps.distribution.distributionId,
      "API CloudFront distribution ID",
    );
  }
}
