import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  createApiKeyInputSchema,
  createWebhookEndpointInputSchema,
} from "./api-keys-webhooks-domain.js";

describe("api-keys-webhooks-domain (MK-S15)", () => {
  it("uses forge_live_ prefix constant", () => {
    expect(API_KEY_PREFIX).toBe("forge_live_");
  });

  it("validates api key create input", () => {
    const parsed = createApiKeyInputSchema.parse({
      name: "CI",
      scopes: ["tenant.read"],
    });
    expect(parsed.scopes).toEqual(["tenant.read"]);
  });

  it("validates webhook endpoint create input", () => {
    const parsed = createWebhookEndpointInputSchema.parse({
      name: "Ops",
      endpointUrl: "https://example.com/hooks",
      eventTypes: ["membership.changed"],
    });
    expect(parsed.enabled).toBe(true);
  });
});
