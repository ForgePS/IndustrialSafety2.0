import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeVpcProps {
  config: ForgeEnvironmentConfig;
}

export class ForgeVpc extends Construct {
  readonly vpc: ec2.Vpc;
  readonly flowLogGroup?: logs.LogGroup;
  readonly flowLogBucket?: s3.Bucket;

  constructor(scope: Construct, id: string, props: ForgeVpcProps) {
    super(scope, id);
    const { config } = props;

    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: resourceName(config, "vpc", "main"),
      ipAddresses: ec2.IpAddresses.cidr(config.networking.vpcCidr),
      maxAzs: config.networking.availabilityZoneCount,
      natGateways: config.networking.natGatewayCount,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private-app",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "isolated-db",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
      },
    });

    if (config.networking.enableVpcFlowLogs) {
      if (config.networking.flowLogDestination === "s3") {
        // S3 delivery avoids CloudWatch Logs ingestion charges on high-volume flow logs.
        // SSE-S3 rather than a CMK: the flow log delivery service writes directly, and a
        // CMK would require granting delivery.logs.amazonaws.com on the shared logs key.
        this.flowLogBucket = new s3.Bucket(this, "VpcFlowLogBucket", {
          bucketName: resourceName(config, "s3", "vpc-flow-logs"),
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          enforceSSL: true,
          removalPolicy:
            config.environmentName.includes("production") ||
            config.environmentName.startsWith("govcloud")
              ? cdk.RemovalPolicy.RETAIN
              : cdk.RemovalPolicy.DESTROY,
          autoDeleteObjects: !(
            config.environmentName.includes("production") ||
            config.environmentName.startsWith("govcloud")
          ),
          lifecycleRules: [{ expiration: cdk.Duration.days(config.retention.securityLogsDays) }],
        });
        this.vpc.addFlowLog("FlowLog", {
          destination: ec2.FlowLogDestination.toS3(this.flowLogBucket),
          trafficType: ec2.FlowLogTrafficType.ALL,
        });
      } else {
        this.flowLogGroup = new logs.LogGroup(this, "VpcFlowLogs", {
          logGroupName: `/forge/${config.environmentName}/vpc-flow-logs`,
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        this.vpc.addFlowLog("FlowLog", {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(this.flowLogGroup),
          trafficType: ec2.FlowLogTrafficType.ALL,
        });
      }
    }
  }
}
