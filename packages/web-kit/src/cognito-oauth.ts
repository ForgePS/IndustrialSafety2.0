import { getApiBaseUrl } from "./api-client.js";
import {
  getCsrfToken,
  setBearerToken,
  setCsrfToken,
} from "./auth-storage.js";

export { getCsrfToken, setCsrfToken, clearCsrfToken } from "./auth-storage.js";

const PKCE_VERIFIER_KEY = "forge-oauth-pkce-verifier";
const OAUTH_STATE_KEY = "forge-oauth-state";

const FORGE_CSRF_HEADER = "x-forge-csrf";

export type CognitoOAuthConfig = {
  domain: string;
  clientId: string;
  userPoolId: string;
  appUrl: string;
};

export type CognitoTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
};

export type SessionAuthResponse = {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
};

export class CognitoOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CognitoOAuthError";
  }
}

function requireBrowser(): void {
  if (typeof window === "undefined") {
    throw new CognitoOAuthError("Cognito OAuth is only available in the browser");
  }
}

function readPublicEnv(): {
  domain?: string;
  clientId?: string;
  userPoolId?: string;
  appUrl?: string;
} {
  // Next.js only inlines statically referenced NEXT_PUBLIC_* keys.
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  // Prefer the live browser origin so one static build can OAuth on industrial-dev,
  // producers-rice-mill, CloudFront, and localhost without redirect_mismatch.
  const appUrl =
    (typeof window !== "undefined" ? window.location.origin : undefined) ??
    process.env.NEXT_PUBLIC_APP_URL;

  return {
    ...(domain ? { domain } : {}),
    ...(clientId ? { clientId } : {}),
    ...(userPoolId ? { userPoolId } : {}),
    ...(appUrl ? { appUrl } : {}),
  };
}

/** True when Cognito public env is present (app URL can come from window.origin). */
export function isCognitoOAuthConfigured(): boolean {
  const { domain, clientId, userPoolId } = readPublicEnv();
  return Boolean(domain && clientId && userPoolId);
}

export function getCognitoOAuthConfig(): CognitoOAuthConfig {
  const { domain, clientId, userPoolId, appUrl } = readPublicEnv();

  if (!domain || !clientId || !userPoolId || !appUrl) {
    throw new CognitoOAuthError(
      "Missing Cognito OAuth configuration (NEXT_PUBLIC_COGNITO_DOMAIN, NEXT_PUBLIC_COGNITO_CLIENT_ID, NEXT_PUBLIC_COGNITO_USER_POOL_ID, NEXT_PUBLIC_APP_URL)",
    );
  }

  return { domain, clientId, userPoolId, appUrl };
}

function callbackRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/auth/callback/`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  requireBrowser();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  requireBrowser();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function authorizeEndpoint(domain: string): string {
  return `https://${domain}/oauth2/authorize`;
}

function logoutEndpoint(domain: string): string {
  return `https://${domain}/logout`;
}

function sessionApiUrl(path: string): string {
  try {
    return `${getApiBaseUrl()}${path}`;
  } catch {
    return path;
  }
}

function storeSessionAuth(payload: SessionAuthResponse): CognitoTokenResponse {
  setBearerToken(payload.accessToken);
  setCsrfToken(payload.csrfToken);
  return {
    access_token: payload.accessToken,
    expires_in: payload.expiresIn,
  };
}

async function parseSessionAuthResponse(res: Response): Promise<SessionAuthResponse> {
  let body: {
    data?: Partial<SessionAuthResponse> & { refreshToken?: string; refresh_token?: string };
    error?: { message?: string };
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new CognitoOAuthError(`Session request failed (${res.status})`);
  }

  if (
    body.data &&
    ("refreshToken" in body.data || "refresh_token" in body.data)
  ) {
    throw new CognitoOAuthError("Session response must not include a refresh token");
  }

  if (!res.ok || !body.data?.accessToken || !body.data.csrfToken) {
    const detail = body.error?.message ?? `HTTP ${res.status}`;
    throw new CognitoOAuthError(`Session request failed: ${detail}`);
  }

  return {
    accessToken: body.data.accessToken,
    expiresIn: typeof body.data.expiresIn === "number" ? body.data.expiresIn : 3600,
    csrfToken: body.data.csrfToken,
  };
}

export async function buildAuthorizeUrl(): Promise<string> {
  requireBrowser();
  const config = getCognitoOAuthConfig();
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = crypto.randomUUID();

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: callbackRedirectUri(config.appUrl),
    scope: "openid email profile",
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });

  return `${authorizeEndpoint(config.domain)}?${params.toString()}`;
}

export function validateOAuthState(state: string | null): boolean {
  requireBrowser();
  const expected = sessionStorage.getItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  return Boolean(state && expected && state === expected);
}

/**
 * Exchange an authorization code via the platform-api session BFF.
 * Access + CSRF stay in memory; refresh stays HttpOnly server-side.
 */
export async function exchangeCodeForTokens(code: string): Promise<CognitoTokenResponse> {
  requireBrowser();
  const config = getCognitoOAuthConfig();
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) {
    throw new CognitoOAuthError("Missing PKCE code verifier — restart sign-in");
  }

  const res = await fetch(sessionApiUrl("/api/v1/auth/session/oauth/callback"), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      codeVerifier: verifier,
      redirectUri: callbackRedirectUri(config.appUrl),
    }),
  });

  sessionStorage.removeItem(PKCE_VERIFIER_KEY);

  const payload = await parseSessionAuthResponse(res);
  return storeSessionAuth(payload);
}

/**
 * Refresh via HttpOnly session cookie + CSRF header. Never reads a JS refresh token.
 */
export async function refreshAccessToken(
  options?: { signal?: AbortSignal },
): Promise<CognitoTokenResponse | null> {
  requireBrowser();

  const csrf = getCsrfToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (csrf) {
    headers[FORGE_CSRF_HEADER] = csrf;
  }

  const res = await fetch(sessionApiUrl("/api/v1/auth/session/refresh"), {
    method: "POST",
    credentials: "include",
    headers,
    body: "{}",
    ...(options?.signal ? { signal: options.signal } : {}),
  });

  if (res.status === 401) {
    return null;
  }

  const payload = await parseSessionAuthResponse(res);
  return storeSessionAuth(payload);
}

export function buildLogoutUrl(): string {
  const config = getCognitoOAuthConfig();
  const logoutUri = `${config.appUrl.replace(/\/$/, "")}/`;
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: logoutUri,
  });
  return `${logoutEndpoint(config.domain)}?${params.toString()}`;
}

export async function redirectToCognitoLogin(): Promise<void> {
  requireBrowser();
  window.location.assign(await buildAuthorizeUrl());
}

type CognitoIdpPayload = { __type?: string; message?: string };

async function postCognitoIdp(target: string, body: Record<string, string>): Promise<void> {
  requireBrowser();
  const config = getCognitoOAuthConfig();
  const region = config.userPoolId.split("_")[0];
  if (!region) {
    throw new CognitoOAuthError("Invalid Cognito user pool id");
  }

  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": target,
    },
    body: JSON.stringify({ ClientId: config.clientId, ...body }),
  });

  let payload: CognitoIdpPayload = {};
  try {
    payload = (await response.json()) as CognitoIdpPayload;
  } catch {
    payload = {};
  }

  if (response.ok) {
    return;
  }

  const type = payload.__type?.split("#").pop() ?? "";
  throw new CognitoOAuthError(cognitoIdpErrorMessage(type, payload.message, response.status));
}

function cognitoIdpErrorMessage(type: string, message: string | undefined, status: number): string {
  if (type === "UserNotFoundException") {
    return "No Cognito account exists for this user";
  }
  if (type === "CodeMismatchException") {
    return "That verification code is not valid. Use the newest email, and do not start Forgot password on the Cognito sign-in page.";
  }
  if (type === "ExpiredCodeException") {
    return "That verification code has expired. Ask an admin to send a new reset email.";
  }
  if (type === "InvalidPasswordException" || type === "InvalidParameterException") {
    return message?.includes("password")
      ? "Password must be at least 12 characters and include upper, lower, a number, and a symbol."
      : (message ?? "This account cannot complete a password reset in its current state.");
  }
  if (type === "NotAuthorizedException") {
    return "This account cannot use a self-service reset. Resend their invitation instead.";
  }
  if (type === "LimitExceededException" || type === "TooManyRequestsException") {
    return "Too many password reset attempts. Try again in a few minutes.";
  }
  return message ?? `Password reset failed (${status})`;
}

/**
 * Public Cognito ForgotPassword for a confirmed user. Used as a fallback when
 * the platform-api admin reset endpoint is not deployed yet. Does not work for
 * FORCE_CHANGE_PASSWORD invitation users.
 */
export async function requestCognitoPasswordReset(username: string): Promise<void> {
  await postCognitoIdp("AWSCognitoIdentityProviderService.ForgotPassword", {
    Username: username,
  });
}

/** Completes AdminResetUserPassword / ForgotPassword using the emailed code. */
export async function confirmCognitoPasswordReset(input: {
  username: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  await postCognitoIdp("AWSCognitoIdentityProviderService.ConfirmForgotPassword", {
    Username: input.username,
    ConfirmationCode: input.code,
    Password: input.newPassword,
  });
}

