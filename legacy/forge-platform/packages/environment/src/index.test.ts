import { describe, expect, it } from "vitest";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironment } from "./index.js";

describe("environment", () => {
  it("accepts valid local configuration", () => {
    const env = loadEnvironment(LOCAL_PLACEHOLDER_ENV);
    expect(env.APP_ENV).toBe("local");
    expect(env.AWS_PARTITION).toBe("aws");
  });

  it("rejects missing production values", () => {
    expect(() =>
      loadEnvironment({
        ...LOCAL_PLACEHOLDER_ENV,
        APP_ENV: "production",
        PUBLIC_ACADEMY_URL: "https://academy.example.com",
        PUBLIC_RMS_URL: "https://rms.example.com",
        PUBLIC_CREATOR_URL: "https://creator.example.com",
        PUBLIC_API_URL: "https://api.example.com",
        DATABASE_SECRET_ARN: "",
      }),
    ).toThrow(/DATABASE_SECRET_ARN/);
  });

  it("rejects unsupported AWS partitions", () => {
    expect(() =>
      loadEnvironment({
        ...LOCAL_PLACEHOLDER_ENV,
        AWS_PARTITION: "aws-cn",
      }),
    ).toThrow();
  });
});
