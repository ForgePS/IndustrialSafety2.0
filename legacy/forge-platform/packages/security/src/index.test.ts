import { describe, expect, it } from "vitest";
import {
  createCorrelationId,
  generateApiKey,
  hashOpaqueSecret,
  redactSensitive,
  signWebhookPayload,
  verifyWebhookSignature,
} from "./index.js";

describe("security", () => {
  it("redacts ssn-like keys", () => {
    const result = redactSensitive({ ssn: "123-45-6789", name: "Test" });
    expect(result).toEqual({ ssn: "[REDACTED]", name: "Test" });
  });

  it("redacts authorization headers", () => {
    const result = redactSensitive({ authorization: "Bearer secret", ok: true });
    expect(result).toEqual({ authorization: "[REDACTED]", ok: true });
  });

  it("redacts apiKey fields", () => {
    expect(redactSensitive({ apiKey: "forge_live_abc" }).apiKey).toBe("[REDACTED]");
  });

  it("generates correlation ids", () => {
    expect(createCorrelationId()).toMatch(/^[a-f0-9]{32}$/);
  });

  it("generateApiKey hashes forge_live_ keys", () => {
    const key = generateApiKey({ prefix: "forge_live_" });
    expect(key.rawKey.startsWith("forge_live_")).toBe(true);
    expect(key.keyHash).toBe(hashOpaqueSecret(key.rawKey));
    expect(key.displayHint.includes("…")).toBe(true);
  });

  it("signs and verifies webhook payloads", () => {
    const body = '{"hello":"world"}';
    const secret = "whsec_abc";
    const header = signWebhookPayload(body, secret);
    expect(header.startsWith("sha256=")).toBe(true);
    expect(verifyWebhookSignature(body, header, secret)).toBe(true);
  });
});
