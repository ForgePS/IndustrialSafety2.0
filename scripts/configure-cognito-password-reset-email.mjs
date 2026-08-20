#!/usr/bin/env node
/**
 * Attach (or refresh) the Cognito CustomMessage lambda so password-reset emails
 * include the Forge reset link. Re-runs are idempotent.
 *
 * Does not use a partial UpdateUserPool (that would reset pool settings).
 *
 * Usage:
 *   AWS_PROFILE=forge-dev node scripts/configure-cognito-password-reset-email.mjs
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const LAMBDA_NAME = "forge-production-lambda-cognito-custom-message";
const ROLE_NAME = "forge-production-lambda-cognito-custom-message-role";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const handlerDir = path.join(
  repoRoot,
  "infrastructure/cdk/lib/lambdas/cognito-custom-message",
);
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-cognito-msg-"));

function aws(args, options = {}) {
  const result = execFileSync("aws", args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return typeof result === "string" ? result.trim() : "";
}

function awsJson(args) {
  return JSON.parse(aws([...args, "--output", "json"]));
}

function exportValue(name) {
  const prefixed = `Forge-Production-Identity:${name}`;
  const raw = aws([
    "cloudformation",
    "list-exports",
    "--region",
    REGION,
    "--query",
    `Exports[?Name==\`${prefixed}\`].Value | [0]`,
    "--output",
    "text",
  ]);
  const value = String(raw)
    .replace(/\r/g, "")
    .trim()
    .split("\n")
    .filter((line) => line && line !== "None")
    .at(-1);
  if (!value) {
    throw new Error(`Missing CloudFormation export: ${prefixed}`);
  }
  return value;
}

function defined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

function toUpdateUserPoolInput(pool, lambdaConfig) {
  const adminCreate = pool.AdminCreateUserConfig
    ? {
        AllowAdminCreateUserOnly: pool.AdminCreateUserConfig.AllowAdminCreateUserOnly,
        InviteMessageTemplate: pool.AdminCreateUserConfig.InviteMessageTemplate,
      }
    : undefined;
  return defined({
    UserPoolId: pool.Id,
    Policies: pool.Policies,
    DeletionProtection: pool.DeletionProtection,
    LambdaConfig: lambdaConfig,
    AutoVerifiedAttributes: pool.AutoVerifiedAttributes,
    SmsVerificationMessage: pool.SmsVerificationMessage,
    EmailVerificationMessage: pool.EmailVerificationMessage,
    EmailVerificationSubject: pool.EmailVerificationSubject,
    VerificationMessageTemplate: pool.VerificationMessageTemplate,
    SmsAuthenticationMessage: pool.SmsAuthenticationMessage,
    UserAttributeUpdateSettings: pool.UserAttributeUpdateSettings,
    MfaConfiguration: pool.MfaConfiguration,
    DeviceConfiguration: pool.DeviceConfiguration,
    EmailConfiguration: pool.EmailConfiguration,
    SmsConfiguration: pool.SmsConfiguration,
    UserPoolTags: pool.UserPoolTags,
    AdminCreateUserConfig: adminCreate,
    UserPoolAddOns: pool.UserPoolAddOns,
    AccountRecoverySetting: pool.AccountRecoverySetting,
    UserPoolTier: pool.UserPoolTier,
  });
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing: account ${identity.Account} != ${ACCOUNT}`);
}

const userPoolId = exportValue("ForgeIdentity-UserPoolId");
const industrialClientId = exportValue("ForgeIdentity-IndustrialClientId");
const appUrlByClient = {
  [industrialClientId]: "https://industrial.forgepublicsafety.com",
};
const defaultAppUrl = "https://industrial.forgepublicsafety.com";

const zipPath = path.join(workDir, "function.zip");
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${handlerDir}\\index.mjs' -DestinationPath '${zipPath}' -Force"`,
  { stdio: "inherit" },
);

const envPath = path.join(workDir, "env.json");
fs.writeFileSync(
  envPath,
  JSON.stringify({
    Variables: {
      DEFAULT_APP_URL: defaultAppUrl,
      APP_URL_BY_CLIENT_JSON: JSON.stringify(appUrlByClient),
    },
  }),
);

let functionArn;
try {
  functionArn = aws([
    "lambda",
    "get-function",
    "--function-name",
    LAMBDA_NAME,
    "--region",
    REGION,
    "--query",
    "Configuration.FunctionArn",
    "--output",
    "text",
  ]);
  aws(
    [
      "lambda",
      "update-function-code",
      "--function-name",
      LAMBDA_NAME,
      "--region",
      REGION,
      "--zip-file",
      `fileb://${zipPath}`,
    ],
    { stdio: "inherit" },
  );
  aws(
    [
      "lambda",
      "wait",
      "function-updated-v2",
      "--function-name",
      LAMBDA_NAME,
      "--region",
      REGION,
    ],
    { stdio: "inherit" },
  );
  aws(
    [
      "lambda",
      "update-function-configuration",
      "--function-name",
      LAMBDA_NAME,
      "--region",
      REGION,
      "--handler",
      "index.handler",
      "--runtime",
      "nodejs20.x",
      "--environment",
      `file://${envPath}`,
    ],
    { stdio: "inherit" },
  );
} catch {
  let roleArn;
  try {
    roleArn = aws(["iam", "get-role", "--role-name", ROLE_NAME, "--query", "Role.Arn", "--output", "text"]);
  } catch {
    const trustPath = path.join(workDir, "trust.json");
    fs.writeFileSync(
      trustPath,
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
    );
    roleArn = awsJson([
      "iam",
      "create-role",
      "--role-name",
      ROLE_NAME,
      "--assume-role-policy-document",
      `file://${trustPath}`,
    ]).Role.Arn;
    aws(
      [
        "iam",
        "attach-role-policy",
        "--role-name",
        ROLE_NAME,
        "--policy-arn",
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      ],
      { stdio: "inherit" },
    );
    execSync("powershell -NoProfile -Command \"Start-Sleep -Seconds 12\"", { stdio: "inherit" });
  }

  functionArn = awsJson([
    "lambda",
    "create-function",
    "--function-name",
    LAMBDA_NAME,
    "--region",
    REGION,
    "--runtime",
    "nodejs20.x",
    "--role",
    roleArn,
    "--handler",
    "index.handler",
    "--zip-file",
    `fileb://${zipPath}`,
    "--timeout",
    "10",
    "--environment",
    `file://${envPath}`,
  ]).FunctionArn;
}

try {
  aws(
    [
      "lambda",
      "add-permission",
      "--function-name",
      LAMBDA_NAME,
      "--region",
      REGION,
      "--statement-id",
      "CognitoCustomMessageInvoke",
      "--action",
      "lambda:InvokeFunction",
      "--principal",
      "cognito-idp.amazonaws.com",
      "--source-arn",
      `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${userPoolId}`,
    ],
    { stdio: "inherit" },
  );
} catch {
  // Statement already exists from a prior run.
}

const pool = awsJson([
  "cognito-idp",
  "describe-user-pool",
  "--user-pool-id",
  userPoolId,
  "--region",
  REGION,
]).UserPool;

const updatePath = path.join(workDir, "update-user-pool.json");
fs.writeFileSync(
  updatePath,
  JSON.stringify(
    toUpdateUserPoolInput(pool, { ...(pool.LambdaConfig ?? {}), CustomMessage: functionArn }),
    null,
    2,
  ),
);
aws(
  ["cognito-idp", "update-user-pool", "--region", REGION, "--cli-input-json", `file://${updatePath}`],
  { stdio: "inherit" },
);

console.log(
  JSON.stringify(
    {
      userPoolId,
      lambdaArn: functionArn,
      defaultAppUrl,
      appUrlByClient,
    },
    null,
    2,
  ),
);
