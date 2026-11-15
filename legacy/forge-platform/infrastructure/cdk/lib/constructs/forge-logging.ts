import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kms from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";

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
    3653: logs.RetentionDays.TEN_YEARS,
  };
  return map[days] ?? logs.RetentionDays.ONE_MONTH;
}

export interface ForgeLoggingProps {
  config: ForgeEnvironmentConfig;
  logsKey: kms.IKey;
}

export class ForgeLogging extends Construct {
  readonly platformApi: logs.LogGroup;
  readonly workerService: logs.LogGroup;
  readonly database: logs.LogGroup;
  readonly waf: logs.LogGroup;
  readonly migration: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ForgeLoggingProps) {
    super(scope, id);
    const { config, logsKey } = props;
    const appRetention = retentionDays(config.retention.applicationLogsDays);
    const securityRetention = retentionDays(config.retention.securityLogsDays);

    const create = (name: string, retention: logs.RetentionDays) =>
      new logs.LogGroup(this, name, {
        logGroupName: `/forge/${config.environmentName}/${name
          .replace(/([A-Z])/g, "-$1")
          .toLowerCase()
          .replace(/^-/, "")}`,
        retention,
        encryptionKey: logsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

    this.platformApi = create("PlatformApi", appRetention);
    this.workerService = create("WorkerService", appRetention);
    this.database = create("Database", appRetention);
    this.waf = create("Waf", securityRetention);
    this.migration = create("Migration", appRetention);
  }
}
