import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

const cdkDir = path.dirname(fileURLToPath(import.meta.url));

export interface ForgeCognitoProps {
  config: ForgeEnvironmentConfig;
}

export class ForgeCognito extends Construct {
  readonly userPool: cognito.UserPool;
  readonly academyClient: cognito.UserPoolClient;
  readonly rmsClient: cognito.UserPoolClient;
  readonly creatorClient: cognito.UserPoolClient;
  readonly industrialClient: cognito.UserPoolClient;
  readonly departmentClient: cognito.UserPoolClient;
  readonly studentClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: ForgeCognitoProps) {
    super(scope, id);
    const { config } = props;

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: resourceName(config, "cognito", "users"),
      signInAliases: { email: true },
      selfSignUpEnabled: config.cognito.selfSignUpEnabled,
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      standardAttributes: {
        email: { required: true, mutable: true },
      },
    });

    const clientProps = {
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: false,
        adminUserPassword: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: config.cognito.callbackUrls,
        logoutUrls: config.cognito.logoutUrls,
      },
      preventUserExistenceErrors: true,
    };

    this.academyClient = this.userPool.addClient("AcademyWeb", {
      ...clientProps,
      userPoolClientName: resourceName(config, "cognito", "academy-web"),
    });
    this.rmsClient = this.userPool.addClient("RmsWeb", {
      ...clientProps,
      userPoolClientName: resourceName(config, "cognito", "rms-web"),
    });
    this.creatorClient = this.userPool.addClient("CreatorConsole", {
      ...clientProps,
      userPoolClientName: resourceName(config, "cognito", "creator-console"),
    });
    this.industrialClient = this.userPool.addClient("IndustrialWeb", {
      ...clientProps,
      userPoolClientName: resourceName(config, "cognito", "industrial-web"),
    });
    this.departmentClient = this.userPool.addClient("DepartmentPortal", {
      ...clientProps,
      userPoolClientName: resourceName(config, "cognito", "department-portal"),
    });
    this.studentClient = this.userPool.addClient("StudentPortal", {
      ...clientProps,
      userPoolClientName: resourceName(config, "cognito", "student-portal"),
    });

    this.userPool.addDomain("Domain", {
      cognitoDomain: {
        domainPrefix: `forge-${config.environmentName}-${config.account.slice(-6)}`,
      },
    });

    const defaultIndustrialUrl = config.domains?.industrial
      ? `https://${config.domains.industrial}`
      : "https://industrial.forgepublicsafety.com";
    const appUrlByClient = Object.fromEntries(
      [
        [this.rmsClient.userPoolClientId, config.domains?.rms],
        [this.creatorClient.userPoolClientId, config.domains?.creator],
        [this.industrialClient.userPoolClientId, config.domains?.industrial],
        [this.academyClient.userPoolClientId, config.domains?.academy],
        [this.departmentClient.userPoolClientId, config.domains?.tenantAdmin],
      ]
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
        .map(([clientId, host]) => [clientId, `https://${host}`]),
    );

    const customMessageFn = new lambda.Function(this, "PasswordResetCustomMessage", {
      functionName: resourceName(config, "lambda", "cognito-custom-message"),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(cdkDir, "../lambdas/cognito-custom-message")),
      timeout: cdk.Duration.seconds(10),
      environment: {
        DEFAULT_APP_URL: defaultIndustrialUrl,
        APP_URL_BY_CLIENT_JSON: JSON.stringify(appUrlByClient),
      },
    });
    this.userPool.addTrigger(cognito.UserPoolOperation.CUSTOM_MESSAGE, customMessageFn);
    customMessageFn.addPermission("CognitoInvoke", {
      principal: new iam.ServicePrincipal("cognito-idp.amazonaws.com"),
      sourceArn: this.userPool.userPoolArn,
    });
  }
}
