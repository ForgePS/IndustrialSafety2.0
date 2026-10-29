import { describe, expect, it } from "vitest";
import type { CadNormalizedEvent } from "@forge/cad-contracts";
import { buildCadDispatchFieldCandidates } from "./cad-neris-field-application.js";

const sample = {
  eventId: "evt-1",
  tenantId: "tenant-1",
  connectionId: "conn-1",
  rawMessageId: "raw-1",
  source: {
    vendor: "Synthetic",
    adapterKey: "forge.synthetic",
    adapterVersion: "1.0.0",
    incidentId: "SRC-1001",
    timestamp: "2026-09-30T10:00:00.000Z",
  },
  eventType: "INCIDENT_UPDATED",
  incident: { callType: "STRUCTURE_FIRE" },
  timestamps: {
    callReceived: "2026-09-30T09:59:00.000Z",
    callEntered: "2026-09-30T09:59:10.000Z",
    closed: "2026-09-30T11:15:00.000Z",
  },
  comments: [
    { text: "Public note", restricted: false },
    { text: "Private note", restricted: true },
  ],
  disposition: { description: "Incident closed" },
  provenance: [],
} satisfies CadNormalizedEvent;

describe("CAD dispatch field mapping", () => {
  it("maps normalized dispatch values", () => {
    const result = buildCadDispatchFieldCandidates(sample);
    const byKey = new Map(result.map((item) => [item.fieldKey, item]));
    expect(byKey.get("dispatch_internal_id")?.valueText).toBe("SRC-1001");
    expect(byKey.get("dispatch_incident_code")?.valueText).toBe("STRUCTURE_FIRE");
    expect(byKey.get("dispatch_final_disposition")?.valueText).toBe("Incident closed");
  });

  it("keeps only non-restricted comments", () => {
    const result = buildCadDispatchFieldCandidates(sample);
    const comments = result.find((item) => item.fieldKey === "dispatch_comment");
    expect(comments?.valueJson).toEqual(["Public note"]);
  });
});
