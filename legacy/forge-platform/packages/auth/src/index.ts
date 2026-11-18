import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface CognitoTokenClaims extends JWTPayload {
  sub: string;
  token_use?: string;
  client_id?: string;
  aud?: string | string[];
  email?: string;
}

export interface CognitoVerifierOptions {
  region: string;
  userPoolId: string;
  clientId: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(region: string, userPoolId: string) {
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    jwksCache.set(issuer, jwks);
  }
  return { issuer, jwks };
}

/**
 * Pure claim checks used after cryptographic JWT verification.
 * Kept separate so session security rules can be unit-tested without JWKS.
 */
export function assertCognitoAccessTokenClaims(
  claims: CognitoTokenClaims,
  options: Pick<CognitoVerifierOptions, "clientId">,
): CognitoTokenClaims {
  if (!claims.sub) {
    throw new Error("Token missing subject");
  }
  if (claims.token_use && claims.token_use !== "access" && claims.token_use !== "id") {
    throw new Error("Unexpected token_use");
  }

  const audience = claims.client_id ?? claims.aud;
  const audiences = Array.isArray(audience) ? audience : audience ? [audience] : [];
  const allowedClients = options.clientId
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!allowedClients.some((id) => audiences.includes(id))) {
    throw new Error("Token audience/client mismatch");
  }

  return claims;
}

export async function verifyCognitoAccessToken(
  token: string,
  options: CognitoVerifierOptions,
): Promise<CognitoTokenClaims> {
  const { issuer, jwks } = getJwks(options.region, options.userPoolId);
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    clockTolerance: 5,
  });

  return assertCognitoAccessTokenClaims(payload as CognitoTokenClaims, options);
}

export function clearJwksCache(): void {
  jwksCache.clear();
}
