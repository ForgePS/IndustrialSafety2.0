import { describe, expect, it } from "vitest";
import {
  buildCadSimulatorPayload,
  listCadSimulatorScenarios,
  signCadSimulatorWebhook,
} from "./index.js";
import { FORGE_CAD_HEADERS, verifyCadWebhookSignature } from "@forge/cad-core";

describe("cad-simulator", () => {
  it("lists known scenarios", () => {
    const scenarios = listCadSimulatorScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(5);
    expect(scenarios.some((row) => row.id === "new-incident")).toBe(true);
  });

  it("builds and signs a webhook payload", () => {
    const payload = buildCadSimulatorPayload({ scenarioId: "new-incident" });
    expect(payload.eventType).toBe("INCIDENT_CREATED");
    const signed = signCadSimulatorWebhook({
      payload,
      secret: "test-secret",
      keyId: "wk_test",
    });
    expect(signed.headers[FORGE_CAD_HEADERS.SIGNATURE]).toBeTruthy();
    expect(
      verifyCadWebhookSignature({
        secret: "test-secret",
        timestamp: signed.headers[FORGE_CAD_HEADERS.TIMESTAMP]!,
        nonce: signed.headers[FORGE_CAD_HEADERS.NONCE]!,
        messageId: signed.headers[FORGE_CAD_HEADERS.MESSAGE_ID]!,
        bodySha256Hex: signed.bodySha256Hex,
        providedSignatureHex: signed.headers[FORGE_CAD_HEADERS.SIGNATURE]!,
      }),
    ).toBe(true);
  });
});
