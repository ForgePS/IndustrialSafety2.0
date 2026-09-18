import { describe, expect, it } from "vitest";
import {
  assertNoRefreshCredentialLeak,
  toPublicAuthSessionPayload,
} from "./auth-session.public-payload.js";
import { buildSessionSetCookie, sessionCookieName } from "./auth-session-cookie.js";

describe("public auth session payload (FIS-H01)", () => {
  it("strips refresh and raw session token from JSON responses", () => {
    const payload = toPublicAuthSessionPayload({
      accessToken: "access",
      expiresIn: 3600,
      csrfToken: "csrf",
      rawSessionToken: "raw-session-secret",
      refreshToken: "refresh-secret",
    });
    expect(payload).toEqual({
      accessToken: "access",
      expiresIn: 3600,
      csrfToken: "csrf",
    });
    expect(() => assertNoRefreshCredentialLeak(payload)).not.toThrow();
    expect(() =>
      assertNoRefreshCredentialLeak({
        ...payload,
        refresh_token: "leak",
      }),
    ).toThrow(/refresh token/i);
  });
});

describe("session cookie flags (FIS-H01)", () => {
  it("sets HttpOnly Secure SameSite=Strict Path=/ without Domain", () => {
    const name = sessionCookieName({ protocol: "https", host: "producersrice.forgepublicsafety.com" });
    const header = buildSessionSetCookie("opaque-session", {
      cookieName: name,
      maxAgeSeconds: 3600,
      secure: true,
    });
    expect(name).toBe("__Host-forge-session");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/");
    expect(header.toLowerCase()).not.toContain("domain=");
  });
});
