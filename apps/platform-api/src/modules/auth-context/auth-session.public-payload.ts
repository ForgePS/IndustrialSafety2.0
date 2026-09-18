/**
 * Contract for JSON returned to the browser from auth session endpoints.
 * Must never include refresh tokens or raw session cookie values.
 */
export type PublicAuthSessionPayload = {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
};

export function toPublicAuthSessionPayload(input: {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
  rawSessionToken?: string;
  refreshToken?: string;
}): PublicAuthSessionPayload {
  return {
    accessToken: input.accessToken,
    expiresIn: input.expiresIn,
    csrfToken: input.csrfToken,
  };
}

export function assertNoRefreshCredentialLeak(payload: unknown): void {
  const json = JSON.stringify(payload);
  if (/refresh[_-]?token/i.test(json)) {
    throw new Error("Session payload must not include a refresh token");
  }
  if (payload && typeof payload === "object" && "rawSessionToken" in payload) {
    throw new Error("Session payload must not include rawSessionToken");
  }
}
