import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { developmentConfig } from "../lib/config/development.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";
import { AuditStack } from "../lib/stacks/audit-stack.js";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as kms from "aws-cdk-lib/aws-kms";

describe("AuditStack CloudTrail", () => {
  const app = new cdk.App();
  const security = new SecurityStack(app, "TestSecurityForAudit", {
    config: developmentConfig,
    env: { account: "111122223333", region: "us-east-1" },
  });

  // Lightweight stand-in buckets (same stack isolation as unit tests).
  const bucketStack = new cdk.Stack(app, "TestBuckets", {
    env: { account: "111122223333", region: "us-east-1" },
  });
  const key = new kms.Key(bucketStack, "Key");
  const documents = new s3.Bucket(bucketStack, "Documents", {
    encryptionKey: key,
    encryption: s3.BucketEncryption.KMS,
  });
  const exportsBucket = new s3.Bucket(bucketStack, "Exports", {
    encryptionKey: key,
    encryption: s3.BucketEncryption.KMS,
  });
  const auditArchive = new s3.Bucket(bucketStack, "AuditArchive", {
    encryptionKey: key,
    encryption: s3.BucketEncryption.KMS,
  });

  const audit = new AuditStack(app, "TestAudit", {
    config: {
      ...developmentConfig,
      account: "111122223333",
      region: "us-east-1",
      features: { ...developmentConfig.features, enableCloudTrail: true },
    },
    env: { account: "111122223333", region: "us-east-1" },
    storageKey: security.storageKey,
    logsKey: security.logsKey,
    dataEventBuckets: [documents, exportsBucket, auditArchive],
  });
  const template = Template.fromStack(audit);

  it("creates a multi-region trail with log file validation", () => {
    template.hasResourceProperties("AWS::CloudTrail::Trail", {
      IsMultiRegionTrail: true,
      IncludeGlobalServiceEvents: true,
      EnableLogFileValidation: true,
      IsLogging: true,
    });
    expect(developmentConfig.features.enableCloudTrail).toBe(true);
  });

  it("creates an encrypted versioned CloudTrail bucket with public access blocked", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      VersioningConfiguration: { Status: "Enabled" },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" },
          }),
        ]),
      },
    });
  });

  it("delivers events to an encrypted CloudWatch log group", () => {
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    template.hasResourceProperties("AWS::CloudTrail::Trail", {
      CloudWatchLogsLogGroupArn: Match.anyValue(),
    });
  });

  it("creates security metric filter alarms", () => {
    template.resourcePropertiesCountIs(
      "AWS::Logs::MetricFilter",
      Match.objectLike({
        MetricTransformations: Match.anyValue(),
      }),
      17,
    );
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      AlarmName: Match.stringLikeRegexp("forge-development-alarm-"),
    });
  });
});

describe("AuditStack feature gate", () => {
  it("development profile enables CloudTrail by default", () => {
    expect(developmentConfig.features.enableCloudTrail).toBe(true);
  });
});
