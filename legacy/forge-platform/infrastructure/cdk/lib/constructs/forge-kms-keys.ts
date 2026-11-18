import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeKmsKeysProps {
  config: ForgeEnvironmentConfig;
}

export class ForgeKmsKeys extends Construct {
  readonly generalKey: kms.Key;
  readonly sensitiveDataKey: kms.Key;
  readonly storageKey: kms.Key;
  readonly logsKey: kms.Key;
  readonly backupKey: kms.Key;

  constructor(scope: Construct, id: string, props: ForgeKmsKeysProps) {
    super(scope, id);
    const { config } = props;
    const retain =
      config.environmentName.includes("production") || config.environmentName.includes("govcloud");

    const createKey = (name: string, description: string) => {
      const key = new kms.Key(this, name, {
        alias: `alias/${resourceName(config, "kms", name.toLowerCase())}`,
        description,
        enableKeyRotation: true,
        removalPolicy: retain ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.RETAIN,
      });
      return key;
    };

    this.generalKey = createKey("General", "General platform encryption");
    this.sensitiveDataKey = createKey(
      "SensitiveData",
      "Restricted sensitive data (SSN/FEMA) — must remain separate",
    );
    this.storageKey = createKey("Storage", "S3 bucket encryption");
    this.logsKey = createKey("Logs", "CloudWatch / audit log encryption");
    this.backupKey = createKey("Backup", "AWS Backup vault encryption");

    // CloudWatch Logs calls KMS as a service principal rather than through an IAM
    // role, so account-root delegation in the default key policy is not enough.
    // The encryption context condition keeps the grant scoped to this account's
    // log groups. Partition-neutral via Aws.PARTITION for GovCloud reuse.
    this.logsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudWatchLogs",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal(`logs.${cdk.Aws.REGION}.amazonaws.com`)],
        actions: [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*",
        ],
        resources: ["*"],
        conditions: {
          ArnLike: {
            "kms:EncryptionContext:aws:logs:arn": `arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:*`,
          },
        },
      }),
    );
  }
}
