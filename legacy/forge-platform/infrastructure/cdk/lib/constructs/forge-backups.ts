import * as cdk from "aws-cdk-lib";
import * as backup from "aws-cdk-lib/aws-backup";
import * as kms from "aws-cdk-lib/aws-kms";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeBackupsProps {
  config: ForgeEnvironmentConfig;
  backupKey: kms.IKey;
  databaseCluster: rds.DatabaseCluster;
  documentsBucket: s3.IBucket;
  auditArchiveBucket: s3.IBucket;
}

export class ForgeBackups extends Construct {
  readonly vault: backup.BackupVault;
  readonly plan: backup.BackupPlan;

  constructor(scope: Construct, id: string, props: ForgeBackupsProps) {
    super(scope, id);
    const { config, backupKey } = props;

    this.vault = new backup.BackupVault(this, "Vault", {
      backupVaultName: resourceName(config, "backup", "primary"),
      encryptionKey: backupKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.plan = new backup.BackupPlan(this, "Plan", {
      backupPlanName: resourceName(config, "backup", "daily"),
      backupVault: this.vault,
      backupPlanRules: [
        new backup.BackupPlanRule({
          ruleName: "Daily",
          scheduleExpression: cdk.aws_events.Schedule.cron({
            hour: "5",
            minute: "0",
          }),
          deleteAfter: cdk.Duration.days(14),
        }),
      ],
    });

    this.plan.addSelection("Database", {
      resources: [backup.BackupResource.fromRdsDatabaseCluster(props.databaseCluster)],
    });

    // S3 selections are prepared; continuous S3 backup may need account opt-in.
    this.plan.addSelection("Documents", {
      resources: [backup.BackupResource.fromArn(props.documentsBucket.bucketArn)],
    });
    this.plan.addSelection("AuditArchive", {
      resources: [backup.BackupResource.fromArn(props.auditArchiveBucket.bucketArn)],
    });
  }
}
