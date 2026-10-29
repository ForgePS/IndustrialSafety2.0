export function isCognitoConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_COGNITO_DOMAIN &&
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID &&
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID &&
    process.env.NEXT_PUBLIC_APP_URL,
  );
}

export function isAuthSetupMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("missing cognito oauth") ||
    normalized.includes("next_public_cognito") ||
    normalized.includes("next_public_app_url")
  );
}

export function friendlyAuthMessage(message: string): string {
  if (isAuthSetupMessage(message)) {
    return "Sign-in is not configured for this environment yet. Add Cognito settings to .env.local (see .env.local.example), then restart the dev server.";
  }
  return message;
}
