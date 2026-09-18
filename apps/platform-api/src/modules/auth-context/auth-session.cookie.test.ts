import { describe, expect, it } from "vitest";
import {
  FORGE_CSRF_HEADER,
  buildClearSessionCookie,
  buildSessionSetCookie,
  isTrustedBrowserOrigin,
  parseCookieHeader,
  readSessionTokenFromCookieHeader,
  sessionCookieName,
} from "./auth-session-cookie.js";
import { parseCorsOriginRules } from "../../common/cors-origin.js";

describe("auth-session-cookie", () => {
  it("uses __Host- prefix only for https non-localhost", () => {
    expect(sessionCookieName({ protocol: "https", host: "app.example.com" })).toBe(
      "__Host-forge-session",
    );
    expect(sessionCookieName({ protocol: "https", host: "localhost" })).toBe("forge-session");
    expect(sessionCookieName({ protocol: "http", host: "localhost:3000" })).toBe("forge-session");
  });

  it("builds HttpOnly Strict cookies without Domain", () => {
    const setCookie = buildSessionSetCookie("tok", {
      cookieName: "__Host-forge-session",
      maxAgeSeconds: 3600,
      secure: true,
    });
    expect(setCookie).toContain("__Host-forge-session=tok");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("Path=/");
    expect(setCookie.toLowerCase()).not.toContain("domain=");
  });

  it("clears cookie with Max-Age=0 and no Domain", () => {
    const clear = buildClearSessionCookie({
      cookieName: "forge-session",
      secure: false,
    });
    expect(clear).toContain("Max-Age=0");
    expect(clear.toLowerCase()).not.toContain("domain=");
  });

  it("parses cookie header and reads session token", () => {
    const header = "a=1; forge-session=abc%2Fdef; other=x";
    expect(parseCookieHeader(header)["forge-session"]).toBe("abc/def");
    expect(
      readSessionTokenFromCookieHeader(header, { protocol: "http", host: "localhost" }),
    ).toBe("abc/def");
  });

  it("exports CSRF header name", () => {
    expect(FORGE_CSRF_HEADER).toBe("x-forge-csrf");
  });

  it("validates Origin against CORS allowlist", () => {
    const rules = parseCorsOriginRules("https://app.example.com", ".example.com");
    expect(
      isTrustedBrowserOrigin({
        origin: "https://tenant.example.com",
        referer: undefined,
        requestHost: "api.example.com",
        requestProtocol: "https",
        rules,
        appEnv: "production",
      }),
    ).toBe(true);

    expect(
      isTrustedBrowserOrigin({
        origin: "https://evil.test",
        referer: undefined,
        requestHost: "api.example.com",
        requestProtocol: "https",
        rules,
        appEnv: "production",
      }),
    ).toBe(false);
  });
});
