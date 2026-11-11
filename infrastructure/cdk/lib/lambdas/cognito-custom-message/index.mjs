/**
 * Cognito CustomMessage trigger — injects product reset URL into password-reset emails.
 * Env:
 *   DEFAULT_APP_URL — fallback when the caller's app client is unknown (admin reset)
 *   APP_URL_BY_CLIENT_NAME_JSON — { "<cognitoClientName>": "https://app.example.com", ... } (CDK)
 *   APP_URL_BY_CLIENT_JSON — { "<cognitoClientId>": "https://app.example.com", ... } (legacy,
 *     set by scripts/configure-cognito-password-reset-email.mjs)
 */
const RESET_PATH = "/auth/reset-password/";
const LOOKUP_TIMEOUT_MS = 1500;

let cognitoClient;
const clientNameCache = new Map();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseMap(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

async function lookupClientName(userPoolId, clientId) {
  if (clientNameCache.has(clientId)) return clientNameCache.get(clientId);
  try {
    // The Lambda Node.js runtime bundles AWS SDK v3; load it lazily so tests need no SDK.
    const { CognitoIdentityProviderClient, DescribeUserPoolClientCommand } =
      await import("@aws-sdk/client-cognito-identity-provider");
    cognitoClient ??= new CognitoIdentityProviderClient({ maxAttempts: 2 });
    // Cognito gives CustomMessage triggers 5s in total, so give up early and use the default URL.
    const out = await cognitoClient.send(
      new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: clientId }),
      { abortSignal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    const name = out.UserPoolClient?.ClientName ?? null;
    clientNameCache.set(clientId, name);
    return name;
  } catch (error) {
    // Fall back to the default URL rather than blocking the reset email.
    console.warn("DescribeUserPoolClient failed", error?.name ?? error);
    return null;
  }
}

export async function resolveAppUrl(event, lookup = lookupClientName) {
  const clientId = event.callerContext?.clientId;
  const fallback = String(
    process.env.DEFAULT_APP_URL || "https://industrial.forgepublicsafety.com",
  ).replace(/\/$/, "");
  if (!clientId) return fallback;

  const byId = parseMap(process.env.APP_URL_BY_CLIENT_JSON);
  if (byId[clientId]) return String(byId[clientId]).replace(/\/$/, "");

  const byName = parseMap(process.env.APP_URL_BY_CLIENT_NAME_JSON);
  if (Object.keys(byName).length > 0 && event.userPoolId) {
    const name = await lookup(event.userPoolId, clientId);
    if (name && byName[name]) return String(byName[name]).replace(/\/$/, "");
  }
  return fallback;
}

export const handler = async (event) => {
  const source = event.triggerSource;
  const isPasswordReset =
    source === "CustomMessage_ForgotPassword" || source === "CustomMessage_AdminResetUserPassword";

  if (!isPasswordReset) {
    return event;
  }

  const email = event.request.userAttributes?.email ?? event.userName ?? "";
  const appUrl = await resolveAppUrl(event);
  const link = `${appUrl}${RESET_PATH}?email=${encodeURIComponent(email)}`;

  event.response.emailSubject = "Reset your Forge password";
  // Cognito delivers emailMessage as HTML: plain newlines collapse and bare URLs are not
  // reliably clickable, so send real markup with an anchor.
  const href = escapeHtml(link);
  event.response.emailMessage = [
    `<p>Your password reset code is <strong>${event.request.codeParameter}</strong>.</p>`,
    `<p><a href="${href}">Set a new password</a></p>`,
    `<p>Or copy this link into your browser:<br>${href}</p>`,
    `<p>If you did not request a reset, you can ignore this email. The code expires in 24 hours.</p>`,
  ].join("\n");

  return event;
};
