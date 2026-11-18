import * as cdk from "aws-cdk-lib";
import * as cloudtrail from "aws-cdk-lib/aws-cloudtrail";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName, uniqueBucketName } from "../utils/naming.js";

function retentionDays(days: number): logs.RetentionDays {
  const map: Record<number, logs.RetentionDays> = {
    1: logs.RetentionDays.ONE_DAY,
    3: logs.RetentionDays.THREE_DAYS,
    5: logs.RetentionDays.FIVE_DAYS,
    7: logs.RetentionDays.ONE_WEEK,
    14: logs.RetentionDays.TWO_WEEKS,
    30: logs.RetentionDays.ONE_MONTH,
    60: logs.RetentionDays.TWO_MONTHS,
    90: logs.RetentionDays.THREE_MONTHS,
    120: logs.RetentionDays.FOUR_MONTHS,
    150: logs.RetentionDays.FIVE_MONTHS,
    180: logs.RetentionDays.SIX_MONTHS,
    365: logs.RetentionDays.ONE_YEAR,
    400: logs.RetentionDays.THIRTEEN_MONTHS,
    545: logs.RetentionDays.EIGHTEEN_MONTHS,
    731: logs.RetentionDays.TWO_YEARS,
    1827: logs.RetentionDays.FIVE_YEARS,
    2555: logs.RetentionDays.SEVEN_YEARS,
    3653: logs.RetentionDays.TEN_YEARS,
  };
  return map[days] ?? logs.RetentionDays.THREE_MONTHS;
}

export interface ForgeCloudTrailProps {
  config: ForgeEnvironmentConfig;
  /** CMK for CloudTrail S3 objects (partition-neutral service grants applied here). */
  storageKey: kms.IKey;
  /** CMK for CloudWatch Logs delivery (must already allow logs service principal). */
  logsKey: kms.IKey;
  /**
   * Optional buckets for targeted S3 data events (WriteOnly).
   * Do not pass every application bucket — document cost/volume first.
   */
  dataEventBuckets?: s3.IBucket[];
  /** Prefer Alerting stack security topic when provided. */
  alarmTopic?: sns.ITopic;
}

/**
 * Account-level multi-region CloudTrail for Forge SOC 2 readiness (CC-LOG-01).
 *
 * OD-21: Inspect for existing org/account trails before enabling. This construct
 * creates an account trail (not an Organizations trail). Object Lock is not
 * enabled — see gap register for evaluation notes.
 */
export class ForgeCloudTrail extends Construct {
  readonly trail: cloudtrail.Trail;
  readonly bucket: s3.Bucket;
  readonly logGroup: logs.LogGroup;
  readonly alarmTopic: sns.ITopic;
  readonly trailName: string;

  constructor(scope: Construct, id: string, props: ForgeCloudTrailProps) {
    super(scope, id);
    const { config, storageKey, logsKey } = props;
    const isProd =
      config.environmentName.includes("production") ||
      config.environmentName.startsWith("govcloud");

    this.trailName = resourceName(config, "cloudtrail", "management");

    this.alarmTopic =
      props.alarmTopic ??
      new sns.Topic(this, "SecurityAlarmTopic", {
        topicName: resourceName(config, "sns", "security-alarms"),
        displayName: "Forge CloudTrail security alarms (dev may use placeholder subscribers)",
      });

    this.bucket = new s3.Bucket(this, "TrailBucket", {
      bucketName: uniqueBucketName(config, "cloudtrail"),
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: storageKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      // Retain audit logs even in non-prod; compliance evidence must not vanish on stack churn.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          id: "cloudtrail-retention",
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              // Must be strictly less than expiration days (S3 requirement).
              transitionAfter: cdk.Duration.days(
                Math.min(30, Math.max(1, config.retention.auditLogsDays - 1)),
              ),
            },
          ],
          expiration: isProd
            ? undefined
            : cdk.Duration.days(Math.max(config.retention.auditLogsDays, 31)),
          noncurrentVersionExpiration: cdk.Duration.days(90),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    });

    // CloudTrail service principal needs GenerateDataKey for SSE-KMS delivery.
    storageKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudTrailEncrypt",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cloudtrail.amazonaws.com")],
        actions: ["kms:GenerateDataKey*", "kms:DescribeKey"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": cdk.Aws.ACCOUNT_ID,
          },
          ArnLike: {
            "aws:SourceArn": `arn:${cdk.Aws.PARTITION}:cloudtrail:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:trail/${this.trailName}`,
          },
        },
      }),
    );

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AWSCloudTrailAclCheck",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cloudtrail.amazonaws.com")],
        actions: ["s3:GetBucketAcl"],
        resources: [this.bucket.bucketArn],
        conditions: {
          StringEquals: { "aws:SourceAccount": cdk.Aws.ACCOUNT_ID },
          ArnLike: {
            "aws:SourceArn": `arn:${cdk.Aws.PARTITION}:cloudtrail:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:trail/*`,
          },
        },
      }),
    );

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AWSCloudTrailWrite",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cloudtrail.amazonaws.com")],
        actions: ["s3:PutObject"],
        resources: [this.bucket.arnForObjects(`AWSLogs/${cdk.Aws.ACCOUNT_ID}/*`)],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": cdk.Aws.ACCOUNT_ID,
            "s3:x-amz-acl": "bucket-owner-full-control",
          },
          ArnLike: {
            "aws:SourceArn": `arn:${cdk.Aws.PARTITION}:cloudtrail:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:trail/*`,
          },
        },
      }),
    );

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "DenyUnencryptedObjectUploads",
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [this.bucket.arnForObjects("*")],
        conditions: {
          StringNotEquals: {
            "s3:x-amz-server-side-encryption": "aws:kms",
          },
        },
      }),
    );

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "DenyInsecureTransport",
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:*"],
        resources: [this.bucket.bucketArn, this.bucket.arnForObjects("*")],
        conditions: {
          Bool: { "aws:SecureTransport": "false" },
        },
      }),
    );

    // Application ECS task roles are not granted s3:DeleteObject on this bucket
    // (no resource policy allow for app principals). Object Lock is intentionally
    // not enabled — see docs/compliance/soc2/risk for evaluation notes.

    this.logGroup = new logs.LogGroup(this, "TrailLogGroup", {
      logGroupName: `/forge/${config.environmentName}/cloudtrail`,
      retention: retentionDays(config.retention.securityLogsDays),
      encryptionKey: logsKey,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.trail = new cloudtrail.Trail(this, "ManagementTrail", {
      trailName: this.trailName,
      bucket: this.bucket,
      encryptionKey: storageKey,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      enableFileValidation: true,
      managementEvents: cloudtrail.ReadWriteType.ALL,
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: this.logGroup,
    });

    const dataBuckets = props.dataEventBuckets ?? [];
    for (const bucket of dataBuckets) {
      this.trail.addS3EventSelector([{ bucket }], {
        includeManagementEvents: false,
        readWriteType: cloudtrail.ReadWriteType.WRITE_ONLY,
      });
    }

    const snsAction = new cloudwatch_actions.SnsAction(this.alarmTopic);
    this.createMetricFiltersAndAlarms(config, snsAction);

    cdk.Tags.of(this.bucket).add("DataClassification", "Confidential");
    cdk.Tags.of(this.bucket).add("Purpose", "CloudTrailAuditLogs");
  }

  private createMetricFiltersAndAlarms(
    config: ForgeEnvironmentConfig,
    snsAction: cloudwatch_actions.SnsAction,
  ): void {
    const filters: Array<{ id: string; name: string; pattern: string; description: string }> = [
      {
        id: "TrailStopped",
        name: "cloudtrail-stopped",
        pattern: "{ ($.eventName = StopLogging) }",
        description: "CloudTrail StopLogging",
      },
      {
        id: "TrailDeleted",
        name: "cloudtrail-deleted",
        pattern: "{ ($.eventName = DeleteTrail) }",
        description: "CloudTrail DeleteTrail",
      },
      {
        id: "TrailUpdated",
        name: "cloudtrail-updated",
        pattern: "{ ($.eventName = UpdateTrail) || ($.eventName = StartLogging) }",
        description: "CloudTrail configuration changed",
      },
      {
        id: "RootActivity",
        name: "root-activity",
        pattern:
          '{ ($.userIdentity.type = "Root") && ($.userIdentity.invokedBy NOT EXISTS) && ($.eventType != "AwsServiceEvent") }',
        description: "Root account activity",
      },
      {
        id: "UnauthorizedApi",
        name: "unauthorized-api",
        pattern: '{ ($.errorCode = "*UnauthorizedOperation") || ($.errorCode = "AccessDenied*") }',
        description: "Unauthorized / AccessDenied API calls",
      },
      {
        id: "IamPolicyChanges",
        name: "iam-policy-changes",
        pattern:
          "{ ($.eventName = DeleteGroupPolicy) || ($.eventName = DeleteRolePolicy) || ($.eventName = DeleteUserPolicy) || ($.eventName = PutGroupPolicy) || ($.eventName = PutRolePolicy) || ($.eventName = PutUserPolicy) || ($.eventName = CreatePolicy) || ($.eventName = DeletePolicy) || ($.eventName = CreatePolicyVersion) || ($.eventName = DeletePolicyVersion) || ($.eventName = AttachRolePolicy) || ($.eventName = DetachRolePolicy) || ($.eventName = AttachUserPolicy) || ($.eventName = DetachUserPolicy) || ($.eventName = AttachGroupPolicy) || ($.eventName = DetachGroupPolicy) }",
        description: "IAM policy changes",
      },
      {
        id: "IamRoleChanges",
        name: "iam-role-changes",
        pattern:
          "{ ($.eventName = CreateRole) || ($.eventName = DeleteRole) || ($.eventName = UpdateAssumeRolePolicy) }",
        description: "IAM role changes",
      },
      {
        id: "KmsKeyChanges",
        name: "kms-key-changes",
        pattern:
          "{ ($.eventSource = kms.amazonaws.com) && (($.eventName = DisableKey) || ($.eventName = ScheduleKeyDeletion) || ($.eventName = PutKeyPolicy)) }",
        description: "KMS key disable / deletion / policy",
      },
      {
        id: "SecurityGroupChanges",
        name: "sg-changes",
        pattern:
          "{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) || ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) || ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup) }",
        description: "Security group changes",
      },
      {
        id: "NaclChanges",
        name: "nacl-changes",
        pattern:
          "{ ($.eventName = CreateNetworkAcl) || ($.eventName = CreateNetworkAclEntry) || ($.eventName = DeleteNetworkAcl) || ($.eventName = DeleteNetworkAclEntry) || ($.eventName = ReplaceNetworkAclEntry) || ($.eventName = ReplaceNetworkAclAssociation) }",
        description: "Network ACL changes",
      },
      {
        id: "RouteTableChanges",
        name: "route-table-changes",
        pattern:
          "{ ($.eventName = CreateRoute) || ($.eventName = CreateRouteTable) || ($.eventName = ReplaceRoute) || ($.eventName = ReplaceRouteTableAssociation) || ($.eventName = DeleteRouteTable) || ($.eventName = DeleteRoute) || ($.eventName = DisassociateRouteTable) }",
        description: "Route table changes",
      },
      {
        id: "IgwChanges",
        name: "igw-changes",
        pattern:
          "{ ($.eventName = CreateInternetGateway) || ($.eventName = AttachInternetGateway) || ($.eventName = DetachInternetGateway) || ($.eventName = DeleteInternetGateway) }",
        description: "Internet gateway changes",
      },
      {
        id: "S3BucketPolicyChanges",
        name: "s3-bucket-policy-changes",
        pattern:
          "{ ($.eventSource = s3.amazonaws.com) && (($.eventName = PutBucketPolicy) || ($.eventName = DeleteBucketPolicy) || ($.eventName = PutBucketAcl) || ($.eventName = PutPublicAccessBlock)) }",
        description: "S3 bucket policy / ACL / public access changes",
      },
      {
        id: "CwLogDeletion",
        name: "cw-log-deletion",
        pattern:
          "{ ($.eventSource = logs.amazonaws.com) && (($.eventName = DeleteLogGroup) || ($.eventName = DeleteLogStream)) }",
        description: "CloudWatch log deletion",
      },
      {
        id: "SecretsPolicyChanges",
        name: "secrets-policy-changes",
        pattern:
          "{ ($.eventSource = secretsmanager.amazonaws.com) && (($.eventName = PutResourcePolicy) || ($.eventName = DeleteResourcePolicy) || ($.eventName = DeleteSecret)) }",
        description: "Secrets Manager policy / delete",
      },
      {
        id: "ConsoleLoginNoMfa",
        name: "console-login-no-mfa",
        pattern:
          '{ ($.eventName = ConsoleLogin) && ($.additionalEventData.MFAUsed != "Yes") && ($.userIdentity.type = "IAMUser") }',
        description: "Console login without MFA (IAM users; SSO may not populate MFAUsed)",
      },
      {
        id: "SsoPrivilegeHint",
        name: "sso-directory-changes",
        pattern:
          "{ ($.eventSource = sso.amazonaws.com) || ($.eventSource = sso-directory.amazonaws.com) || ($.eventSource = identitystore.amazonaws.com) }",
        description: "Identity Center / SSO API activity (visibility varies by event source)",
      },
    ];

    for (const filter of filters) {
      const metricNamespace = "Forge/CloudTrail";
      const metricName = filter.name;

      this.logGroup.addMetricFilter(filter.id, {
        metricNamespace,
        metricName,
        filterPattern: logs.FilterPattern.literal(filter.pattern),
        metricValue: "1",
      });

      const alarm = new cloudwatch.Alarm(this, `${filter.id}Alarm`, {
        alarmName: resourceName(config, "alarm", filter.name),
        alarmDescription: filter.description,
        metric: new cloudwatch.Metric({
          namespace: metricNamespace,
          metricName,
          statistic: "Sum",
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(snsAction);
    }

    // Logging-failure detection: StopLogging/DeleteTrail filters above plus
    // evidence scripts that assert trail.IsLogging=true. CloudTrail does not
    // reliably publish a universal DeliveryErrors metric for all failure modes.
  }
}
