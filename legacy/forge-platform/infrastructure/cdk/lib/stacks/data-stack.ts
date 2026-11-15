import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeBuckets } from "../constructs/forge-buckets.js";
import { ForgeDatabase } from "../constructs/forge-database.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface DataStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
  vpc: ec2.IVpc;
  databaseSecurityGroup: ec2.ISecurityGroup;
  storageKey: kms.IKey;
}

export class DataStack extends cdk.Stack {
  readonly buckets: ForgeBuckets;
  readonly database: ForgeDatabase;
  readonly cluster: rds.DatabaseCluster;
  readonly documentsBucket: s3.Bucket;
  readonly importsBucket: s3.Bucket;
  readonly exportsBucket: s3.Bucket;
  readonly auditArchiveBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Data"),
    });

    this.buckets = new ForgeBuckets(this, "Buckets", {
      config: props.config,
      storageKey: props.storageKey,
    });
    this.documentsBucket = this.buckets.documents;
    this.importsBucket = this.buckets.imports;
    this.exportsBucket = this.buckets.exports;
    this.auditArchiveBucket = this.buckets.auditArchive;

    this.database = new ForgeDatabase(this, "Database", {
      config: props.config,
      vpc: props.vpc,
      databaseSecurityGroup: props.databaseSecurityGroup,
      storageKey: props.storageKey,
    });
    this.cluster = this.database.cluster;

    exportValue(this, `${id}-DocumentsBucket`, this.documentsBucket.bucketName, "Documents bucket");
    exportValue(
      this,
      `${id}-ClusterEndpoint`,
      this.cluster.clusterEndpoint.hostname,
      "Aurora writer endpoint hostname",
    );
  }
}
