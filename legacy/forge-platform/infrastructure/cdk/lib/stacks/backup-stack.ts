import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeBackups } from "../constructs/forge-backups.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface BackupStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
  backupKey: kms.IKey;
  databaseCluster: rds.DatabaseCluster;
  documentsBucket: s3.IBucket;
  auditArchiveBucket: s3.IBucket;
}

export class BackupStack extends cdk.Stack {
  readonly backups?: ForgeBackups;

  constructor(scope: Construct, id: string, props: BackupStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Backup"),
    });

    if (!props.config.features.enableBackup) {
      exportValue(this, `${id}-BackupEnabled`, "false", "AWS Backup disabled for this environment");
      return;
    }

    this.backups = new ForgeBackups(this, "Backups", {
      config: props.config,
      backupKey: props.backupKey,
      databaseCluster: props.databaseCluster,
      documentsBucket: props.documentsBucket,
      auditArchiveBucket: props.auditArchiveBucket,
    });

    exportValue(
      this,
      `${id}-VaultName`,
      this.backups.vault.backupVaultName,
      "AWS Backup vault name",
    );
  }
}
