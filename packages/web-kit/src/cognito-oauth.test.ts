// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  buildLogoutUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  requestCognitoPasswordReset,
  confirmCognitoPasswordReset,
} from "./cognito-oauth.js";

describe("cognito oauth pkce", () => {
  it("generates URL-safe verifier and matching S256 challenge", async () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);

    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toBe(verifier);
  });
});

describe("cognito oauth logout", () => {
  it("uses origin root as logout_uri", () => {
    process.env.NEXT_PUBLIC_COGNITO_DOMAIN = "example.auth.us-east-1.amazoncognito.com";
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = "clientid";
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID = "us-east-1_abc";
    process.env.NEXT_PUBLIC_APP_URL = window.location.origin;

    const url = new URL(buildLogoutUrl());
    expect(url.searchParams.get("logout_uri")).toBe(window.location.origin + "/");
  });
});

describe("requestCognitoPasswordReset", () => {
  it("posts ForgotPassword to the pool region", async () => {
    process.env.NEXT_PUBLIC_COGNITO_DOMAIN = "example.auth.us-east-1.amazoncognito.com";
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = "clientid";
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID = "us-east-1_abc";
    process.env.NEXT_PUBLIC_APP_URL = window.location.origin;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestCognitoPasswordReset("operator@example.com");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cognito-idp.us-east-1.amazonaws.com/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ClientId: "clientid", Username: "operator@example.com" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("posts ConfirmForgotPassword with the emailed code", async () => {
    process.env.NEXT_PUBLIC_COGNITO_DOMAIN = "example.auth.us-east-1.amazoncognito.com";
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = "clientid";
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID = "us-east-1_abc";
    process.env.NEXT_PUBLIC_APP_URL = window.location.origin;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await confirmCognitoPasswordReset({
      username: "operator@example.com",
      code: "123456",
      newPassword: "Aa1!xxxxxxxx",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cognito-idp.us-east-1.amazonaws.com/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ClientId: "clientid",
          Username: "operator@example.com",
          ConfirmationCode: "123456",
          Password: "Aa1!xxxxxxxx",
        }),
      }),
    );
    vi.unstubAllGlobals();
  });
});
