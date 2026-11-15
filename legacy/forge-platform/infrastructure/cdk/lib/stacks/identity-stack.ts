import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeCognito } from "../constructs/forge-cognito.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface IdentityStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
}

export class IdentityStack extends cdk.Stack {
  readonly cognito: ForgeCognito;
  readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Identity"),
    });

    this.cognito = new ForgeCognito(this, "Cognito", { config: props.config });
    this.userPool = this.cognito.userPool;

    exportValue(this, `${id}-UserPoolId`, this.userPool.userPoolId, "Cognito user pool ID");
    exportValue(
      this,
      `${id}-AcademyClientId`,
      this.cognito.academyClient.userPoolClientId,
      "Academy web Cognito client ID",
    );
    exportValue(
      this,
      `${id}-RmsClientId`,
      this.cognito.rmsClient.userPoolClientId,
      "RMS web Cognito client ID",
    );
    exportValue(
      this,
      `${id}-CreatorClientId`,
      this.cognito.creatorClient.userPoolClientId,
      "Creator Console Cognito client ID",
    );
    exportValue(
      this,
      `${id}-IndustrialClientId`,
      this.cognito.industrialClient.userPoolClientId,
      "Industrial Web Cognito client ID",
    );
    const cognitoDomain = `forge-${props.config.environmentName}-${props.config.account.slice(-6)}.auth.${props.config.region}.amazoncognito.com`;
    exportValue(this, `${id}-CognitoDomain`, cognitoDomain, "Cognito hosted UI domain host");
  }
}
