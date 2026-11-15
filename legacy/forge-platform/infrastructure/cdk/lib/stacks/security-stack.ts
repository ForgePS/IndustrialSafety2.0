import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeKmsKeys } from "../constructs/forge-kms-keys.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface SecurityStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
}

export class SecurityStack extends cdk.Stack {
  readonly keys: ForgeKmsKeys;
  readonly generalKey: kms.IKey;
  readonly sensitiveDataKey: kms.IKey;
  readonly storageKey: kms.IKey;
  readonly logsKey: kms.IKey;
  readonly backupKey: kms.IKey;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Security"),
    });

    this.keys = new ForgeKmsKeys(this, "KmsKeys", { config: props.config });
    this.generalKey = this.keys.generalKey;
    this.sensitiveDataKey = this.keys.sensitiveDataKey;
    this.storageKey = this.keys.storageKey;
    this.logsKey = this.keys.logsKey;
    this.backupKey = this.keys.backupKey;

    exportValue(this, `${id}-GeneralKeyArn`, this.generalKey.keyArn, "General KMS key ARN");
    exportValue(
      this,
      `${id}-SensitiveKeyArn`,
      this.sensitiveDataKey.keyArn,
      "Sensitive-data KMS key ARN (separate)",
    );
  }
}
