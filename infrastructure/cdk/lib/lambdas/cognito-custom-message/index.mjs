/**
 * Cognito CustomMessage trigger — injects product reset URL into password-reset emails.
 * Env:
 *   DEFAULT_APP_URL — fallback when caller clientId is unknown (admin reset)
 *   APP_URL_BY_CLIENT_JSON — { "<cognitoClientId>": "https://app.example.com", ... }
 */
const RESET_PATH = "/auth/reset-password/";

function resolveAppUrl(event) {
  const clientId = event.callerContext?.clientId;
  const map = JSON.parse(process.env.APP_URL_BY_CLIENT_JSON || "{}");
  if (clientId && map[clientId]) {
    return String(map[clientId]).replace(/\/$/, "");
  }
  return String(process.env.DEFAULT_APP_URL || "https://industrial.forgepublicsafety.com").replace(
    /\/$/,
    "",
  );
}

export const handler = async (event) => {
  const source = event.triggerSource;
  const isPasswordReset =
    source === "CustomMessage_ForgotPassword" ||
    source === "CustomMessage_AdminResetUserPassword";

  if (!isPasswordReset) {
    return event;
  }

  const email = event.request.userAttributes?.email ?? event.userName ?? "";
  const appUrl = resolveAppUrl(event);
  const link = `${appUrl}${RESET_PATH}?email=${encodeURIComponent(email)}`;

  event.response.emailSubject = "Reset your Forge password";
  event.response.emailMessage = `Your password reset code is ${event.request.codeParameter}.

Open this link to enter your code and set a new password:
${link}

If you did not request a reset, you can ignore this email. The code expires in 24 hours.`;

  return event;
};
