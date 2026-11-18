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
        // Public client password auth for in-app Sneat login (TLS to Cognito).
        userPassword: true,
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
    // Keyed by app client name, not client ID: putting client IDs in the trigger's
    // environment makes a cycle (pool -> trigger -> client -> pool). The Lambda looks up
    // the caller's client name at runtime.
    const appUrlByClientName = Object.fromEntries(
      [
        [resourceName(config, "cognito", "rms-web"), config.domains?.rms],
        [resourceName(config, "cognito", "creator-console"), config.domains?.creator],
        [resourceName(config, "cognito", "industrial-web"), config.domains?.industrial],
        [resourceName(config, "cognito", "academy-web"), config.domains?.academy],
        [resourceName(config, "cognito", "department-portal"), config.domains?.tenantAdmin],
      ]
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
        .map(([clientName, host]) => [clientName, `https://${host}`]),
    );

    const customMessageFn = new lambda.Function(this, "PasswordResetCustomMessage", {
      // "-cdk" suffix: production already has a hand-deployed function named
      // "<prefix>-lambda-cognito-custom-message" wired to the pool. A distinct name lets
      // CloudFormation create this one and swap the pool trigger in a single update,
      // with no window where the trigger points at a missing function.
      functionName: resourceName(config, "lambda", "cognito-custom-message-cdk"),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(cdkDir, "../lambdas/cognito-custom-message")),
      timeout: cdk.Duration.seconds(10),
      // Cognito allows CustomMessage triggers ~5s. At the 128 MB default, cold starts
      // (SDK import + first DescribeUserPoolClient) measured ~6s and forced retries.
      // More memory means proportionally more CPU and a much faster cold start.
      memorySize: 512,
      environment: {
        DEFAULT_APP_URL: defaultIndustrialUrl,
        APP_URL_BY_CLIENT_NAME_JSON: JSON.stringify(appUrlByClientName),
      },
    });
    // ARN built from the stack's account/region (not the pool) so it adds no dependency.
    customMessageFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:DescribeUserPoolClient"],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "cognito-idp",
            resource: "userpool",
            resourceName: "*",
          }),
        ],
      }),
    );
    this.userPool.addTrigger(cognito.UserPoolOperation.CUSTOM_MESSAGE, customMessageFn);
    customMessageFn.addPermission("CognitoInvoke", {
      principal: new iam.ServicePrincipal("cognito-idp.amazonaws.com"),
      sourceArn: this.userPool.userPoolArn,
    });
  }
}
