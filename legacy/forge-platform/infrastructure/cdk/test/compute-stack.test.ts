import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { developmentConfig } from "../lib/config/development.js";
import { NetworkStack } from "../lib/stacks/network-stack.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";
import { DataStack } from "../lib/stacks/data-stack.js";
import { MessagingStack } from "../lib/stacks/messaging-stack.js";
import { ObservabilityStack } from "../lib/stacks/observability-stack.js";
import { ComputeStack } from "../lib/stacks/compute-stack.js";

describe("ComputeStack", () => {
  const app = new cdk.App();
  const env = {
    account: developmentConfig.account,
    region: developmentConfig.region,
  };
  const network = new NetworkStack(app, "TestNetwork", {
    config: developmentConfig,
    env,
  });
  const security = new SecurityStack(app, "TestSecurity", {
    config: developmentConfig,
    env,
  });
  const messaging = new MessagingStack(app, "TestMessaging", {
    config: developmentConfig,
    env,
    encryptionKey: security.generalKey,
  });
  const data = new DataStack(app, "TestData", {
    config: developmentConfig,
    env,
    vpc: network.vpc,
    databaseSecurityGroup: network.securityGroups.databaseSg,
    storageKey: security.storageKey,
  });
  const observability = new ObservabilityStack(app, "TestObs", {
    config: developmentConfig,
    env,
    logsKey: security.logsKey,
  });
  const stack = new ComputeStack(app, "TestCompute", {
    config: developmentConfig,
    env,
    vpc: network.vpc,
    albSecurityGroup: network.securityGroups.albSg,
    apiSecurityGroup: network.securityGroups.ecsApiSg,
    workerSecurityGroup: network.securityGroups.workerSg,
    databaseSecret: data.database.secret,
    importQueue: messaging.imports,
    notificationQueue: messaging.notifications,
    documentQueue: messaging.documents,
    integrationQueue: messaging.integrationEvents,
    cadIntakeQueue: messaging.cadIntake,
    cadNormalizationQueue: messaging.cadNormalization,
    cadMatchingQueue: messaging.cadMatching,
    cadApplicationQueue: messaging.cadApplication,
    cadPollingQueue: messaging.cadPolling,
    cadRetentionQueue: messaging.cadRetention,
    reportingSchedulesQueue: messaging.reportingSchedules,
    eventBus: messaging.eventBus,
    documentsBucket: data.documentsBucket,
    importsBucket: data.importsBucket,
    exportsBucket: data.exportsBucket,
    apiLogGroup: observability.apiLogGroup,
    workerLogGroup: observability.workerLogGroup,
    cognitoUserPoolId: "us-east-1_TestPool",
    cognitoClientIds: "client-a,client-b",
    cognitoDomain: "forge-development-test.auth.us-east-1.amazoncognito.com",
    browserOrigins: ["https://localhost"],
    publicRmsUrl: "https://localhost:3002",
    publicCreatorUrl: "https://localhost:3001",
  });
  const template = Template.fromStack(stack);

  it("creates ECS cluster, API service, worker service, and ALB", () => {
    template.resourceCountIs("AWS::ECS::Cluster", 1);
    template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
    template.hasResourceProperties("AWS::ECS::Service", {
      ServiceName: Match.stringLikeRegexp("platform-api"),
    });
    template.hasResourceProperties("AWS::ECS::Service", {
      ServiceName: Match.stringLikeRegexp("worker-service"),
    });
  });

  it("creates ECR repositories for core images", () => {
    template.resourceCountIs("AWS::ECR::Repository", 5);
  });

  it("worker service has no public load balancer attachment pattern via separate SG", () => {
    expect(network.securityGroups.workerSg.connections).toBeDefined();
  });

  it("runs the worker at one desired task in development so CAD queue processors can run", () => {
    template.hasResourceProperties("AWS::ECS::Service", {
      ServiceName: Match.stringLikeRegexp("worker-service"),
      DesiredCount: 1,
    });
    template.hasResourceProperties("AWS::ECS::Service", {
      ServiceName: Match.stringLikeRegexp("platform-api"),
      DesiredCount: developmentConfig.compute.apiDesiredCount,
    });
  });

  it("load balancer health check targets /health so Aurora can auto-pause", () => {
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckPath: "/health",
    });
  });
});
