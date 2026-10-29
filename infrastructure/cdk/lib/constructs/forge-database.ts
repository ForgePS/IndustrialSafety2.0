import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as kms from "aws-cdk-lib/aws-kms";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeDatabaseProps {
  config: ForgeEnvironmentConfig;
  vpc: ec2.IVpc;
  databaseSecurityGroup: ec2.ISecurityGroup;
  storageKey: kms.IKey;
}

export class ForgeDatabase extends Construct {
  readonly cluster: rds.DatabaseCluster;
  /** Aurora master / migration credentials (table owner). */
  readonly secret: rds.DatabaseSecret;
  /**
   * Application runtime credentials (`forge_app`).
   *
   * Ownership (GAP-009):
   * - When `config.database.importExistingAppSecret` is true, this is a
   *   read-only name reference (`Secret.fromSecretNameV2`). CloudFormation does
   *   not create, rotate, or delete the secret. Value and ARN stay unchanged.
   * - When false (greenfield), CDK creates and owns the secret. Password must
   *   then be synced to PostgreSQL via `scripts/phase2-provision-forge-app.mjs`
   *   before compute is pointed at this secret.
   */
  readonly appSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: ForgeDatabaseProps) {
    super(scope, id);
    const { config, vpc, databaseSecurityGroup, storageKey } = props;

    this.secret = new rds.DatabaseSecret(this, "DbSecret", {
      username: "forge_admin",
      secretName: resourceName(config, "secrets", "database"),
    });

    const appSecretName = resourceName(config, "secrets", "database-app");
    if (config.database.importExistingAppSecret) {
      // Strategy A (GAP-009): reference existing secret by name — no create/replace.
      this.appSecret = secretsmanager.Secret.fromSecretNameV2(this, "AppDbSecret", appSecretName);
    } else {
      this.appSecret = new secretsmanager.Secret(this, "AppDbSecret", {
        secretName: appSecretName,
        description: "Aurora forge_app runtime credentials (FORCE RLS subject)",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ username: "forge_app" }),
          generateStringKey: "password",
          excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\",
          passwordLength: 32,
        },
      });
    }

    this.cluster = new rds.DatabaseCluster(this, "AuroraCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.of(
          config.database.engineVersion,
          config.database.engineVersion.split(".")[0] ?? "15",
        ),
      }),
      credentials: rds.Credentials.fromSecret(this.secret),
      defaultDatabaseName: "forge_platform",
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSecurityGroup],
      writer: rds.ClusterInstance.serverlessV2("writer", {
        scaleWithWriter: true,
      }),
      readers: config.database.multiAz
        ? [rds.ClusterInstance.serverlessV2("reader", { scaleWithWriter: true })]
        : [],
      serverlessV2MinCapacity: config.database.serverlessMinCapacity,
      serverlessV2MaxCapacity: config.database.serverlessMaxCapacity,
      ...(config.database.autoPauseMinutes !== undefined
        ? {
            serverlessV2AutoPauseDuration: cdk.Duration.minutes(config.database.autoPauseMinutes),
          }
        : {}),
      storageEncrypted: true,
      storageEncryptionKey: storageKey,
      backup: {
        retention: cdk.Duration.days(config.database.backupRetentionDays),
      },
      deletionProtection: config.database.deletionProtection,
      cloudwatchLogsExports: ["postgresql"],
      removalPolicy: config.database.deletionProtection
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.SNAPSHOT,
      clusterIdentifier: resourceName(config, "rds", "aurora"),
    });
  }
}
