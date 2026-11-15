import { describe, expect, it } from "vitest";
import {
  assertS2Transition,
  createImportJobSchema,
  nextStatusForAction,
  putMappingsSchema,
  S2_INITIAL_JOB_STATUS,
} from "./index.js";

describe("import S2 state machine", () => {
  it("starts control-plane jobs in READY_FOR_MAPPING", () => {
    expect(S2_INITIAL_JOB_STATUS).toBe("READY_FOR_MAPPING");
    expect(nextStatusForAction("create", "READY_FOR_MAPPING")).toBe("READY_FOR_MAPPING");
  });

  it("maps replace_mappings to MAPPED", () => {
    expect(nextStatusForAction("replace_mappings", "READY_FOR_MAPPING")).toBe("MAPPED");
    expect(nextStatusForAction("replace_mappings", "MAPPED")).toBe("MAPPED");
  });

  it("rejects invalid transitions", () => {
    expect(() => assertS2Transition("approve", "READY_FOR_MAPPING")).toThrow(
      /does not allow action/,
    );
  });

  it("approve and reject paths", () => {
    expect(nextStatusForAction("submit_for_approval", "MAPPED")).toBe("AWAITING_APPROVAL");
    expect(nextStatusForAction("approve", "AWAITING_APPROVAL")).toBe("APPROVED");
    expect(nextStatusForAction("reject", "AWAITING_APPROVAL")).toBe("MAPPED");
  });

  it("foundation validation/preview transitions (MK-S19)", () => {
    expect(nextStatusForAction("request_validation", "MAPPED")).toBe("READY_FOR_PREVIEW");
    expect(nextStatusForAction("request_preview", "READY_FOR_PREVIEW")).toBe("PREVIEW_READY");
  });
});

describe("import S2 dto validation", () => {
  it("accepts a valid create job payload", () => {
    const parsed = createImportJobSchema.parse({
      productKey: "FORGE_RMS",
      moduleKey: "CORE",
      recordCategory: "generic_record",
      displayName: "Test import",
    });
    expect(parsed.requestedMode).toBe("UPSERT");
    expect(parsed.sourceType).toBe("manual");
  });

  it("rejects unknown create fields", () => {
    expect(() =>
      createImportJobSchema.parse({
        productKey: "FORGE_RMS",
        moduleKey: "CORE",
        recordCategory: "generic_record",
        displayName: "Test",
        tenantId: "nope",
      }),
    ).toThrow();
  });

  it("rejects unsafe mapping transforms", () => {
    expect(() =>
      putMappingsSchema.parse({
        mappings: [
          {
            sourceColumn: "a",
            targetField: "b",
            transform: { transformId: "x", defaultValue: "javascript:alert(1)" },
          },
        ],
      }),
    ).toThrow();
  });
});
