import { spawnSync } from "node:child_process";
import fs from "node:fs";

const USER_POOL_ID = "us-east-1_mJqpAW5qg";
const CLIENT_ID = "7vq5mid0et267n7e2thg2b0kkr";
const NEW_CALLBACK = "https://producersrice.forgeindustrialsafety.com/auth/callback/";
const NEW_LOGOUT = "https://producersrice.forgeindustrialsafety.com/";

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `aws failed`);
  }
  return JSON.parse(r.stdout);
}

const raw = awsJson([
  "cognito-idp",
  "describe-user-pool-client",
  "--user-pool-id",
  USER_POOL_ID,
  "--client-id",
  CLIENT_ID,
  "--region",
  "us-east-1",
  "--output",
  "json",
]).UserPoolClient;

const callbacks = new Set(raw.CallbackURLs ?? []);
const logouts = new Set(raw.LogoutURLs ?? []);
callbacks.add(NEW_CALLBACK);
logouts.add(NEW_LOGOUT);

const input = {
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
  ClientName: raw.ClientName,
  RefreshTokenValidity: raw.RefreshTokenValidity,
  AccessTokenValidity: raw.AccessTokenValidity,
  IdTokenValidity: raw.IdTokenValidity,
  TokenValidityUnits: raw.TokenValidityUnits,
  ExplicitAuthFlows: raw.ExplicitAuthFlows,
  SupportedIdentityProviders: raw.SupportedIdentityProviders,
  CallbackURLs: [...callbacks],
  LogoutURLs: [...logouts],
  AllowedOAuthFlows: raw.AllowedOAuthFlows,
  AllowedOAuthScopes: raw.AllowedOAuthScopes,
  AllowedOAuthFlowsUserPoolClient: raw.AllowedOAuthFlowsUserPoolClient,
  PreventUserExistenceErrors: raw.PreventUserExistenceErrors,
  EnableTokenRevocation: raw.EnableTokenRevocation,
  EnablePropagateAdditionalUserContextData: raw.EnablePropagateAdditionalUserContextData,
  AuthSessionValidity: raw.AuthSessionValidity,
};
if (raw.ReadAttributes) input.ReadAttributes = raw.ReadAttributes;
if (raw.WriteAttributes) input.WriteAttributes = raw.WriteAttributes;

const tmp = ".tmp-cognito-industrial-update.json";
fs.writeFileSync(tmp, JSON.stringify(input));

const updated = awsJson([
  "cognito-idp",
  "update-user-pool-client",
  "--cli-input-json",
  `file://${tmp.replace(/\\/g, "/")}`,
  "--region",
  "us-east-1",
  "--output",
  "json",
]).UserPoolClient;

console.log(
  JSON.stringify(
    {
      hasNewCallback: (updated.CallbackURLs ?? []).includes(NEW_CALLBACK),
      hasNewLogout: (updated.LogoutURLs ?? []).includes(NEW_LOGOUT),
      callbackCount: (updated.CallbackURLs ?? []).length,
    },
    null,
    2,
  ),
);
