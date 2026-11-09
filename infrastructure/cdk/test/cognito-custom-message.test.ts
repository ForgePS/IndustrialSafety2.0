import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- plain JS Lambda handler without type declarations
import { handler, resolveAppUrl } from "../lib/lambdas/cognito-custom-message/index.mjs";

const event = (clientId?: string) => ({
  triggerSource: "CustomMessage_ForgotPassword",
  userPoolId: "us-east-1_pool",
  userName: "worker",
  callerContext: clientId ? { clientId } : {},
  request: { userAttributes: { email: "a@b.com" }, codeParameter: "{####}" },
  response: {} as Record<string, string>,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cognito custom-message Lambda", () => {
  it("resolves the app URL by client name looked up at runtime", async () => {
    vi.stubEnv("DEFAULT_APP_URL", "https://default.example.com");
    vi.stubEnv(
      "APP_URL_BY_CLIENT_NAME_JSON",
      JSON.stringify({ "forge-rms": "https://rms.example.com/" }),
    );
    const lookup = vi.fn().mockResolvedValue("forge-rms");
    expect(await resolveAppUrl(event("c1"), lookup)).toBe("https://rms.example.com");
    expect(lookup).toHaveBeenCalledWith("us-east-1_pool", "c1");
  });

  it("keeps the legacy client-ID map and falls back to the default", async () => {
    vi.stubEnv("DEFAULT_APP_URL", "https://default.example.com/");
    vi.stubEnv("APP_URL_BY_CLIENT_JSON", JSON.stringify({ c1: "https://legacy.example.com" }));
    vi.stubEnv(
      "APP_URL_BY_CLIENT_NAME_JSON",
      JSON.stringify({ "forge-rms": "https://rms.example.com" }),
    );
    const lookup = vi.fn().mockResolvedValue(null);
    expect(await resolveAppUrl(event("c1"), lookup)).toBe("https://legacy.example.com");
    expect(await resolveAppUrl(event("c2"), lookup)).toBe("https://default.example.com");
    expect(await resolveAppUrl(event(), lookup)).toBe("https://default.example.com");
  });

  it("writes the reset link into the email", async () => {
    vi.stubEnv("DEFAULT_APP_URL", "https://default.example.com");
    const out = await handler(event());
    expect(out.response.emailMessage).toContain(
      "https://default.example.com/auth/reset-password/?email=a%40b.com",
    );
  });
});
