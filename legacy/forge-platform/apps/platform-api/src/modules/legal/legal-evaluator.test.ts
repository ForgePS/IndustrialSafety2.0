import { describe, expect, it } from "vitest";
import {
  evaluatePendingRequirements,
  hasBlockingOutstanding,
  hashCanonicalContent,
} from "./legal-evaluator.js";

describe("legal-evaluator", () => {
  it("hashes trimmed canonical content", () => {
    expect(hashCanonicalContent("  hello  ")).toBe(hashCanonicalContent("hello"));
    expect(hashCanonicalContent("a")).not.toBe(hashCanonicalContent("b"));
  });

  it("requires acknowledgment when never accepted", () => {
    const pending = evaluatePendingRequirements({
      requirements: [
        {
          requirementId: "r1",
          documentId: "d1",
          documentVersionId: "v1",
          documentKey: "forge-global-terms",
          documentTitle: "Terms",
          documentType: "TERMS_OF_USE",
          version: "1.0",
          versionNumber: 1,
          contentHash: "abc",
          effectiveAt: new Date("2020-01-01"),
          blockingMode: "BLOCKING",
          requiredBy: null,
          tenantId: null,
        },
      ],
      acceptances: [],
    });
    expect(pending).toHaveLength(1);
    expect(hasBlockingOutstanding(pending)).toBe(true);
  });

  it("skips when already acknowledged", () => {
    const pending = evaluatePendingRequirements({
      requirements: [
        {
          requirementId: "r1",
          documentId: "d1",
          documentVersionId: "v1",
          documentKey: "forge-global-terms",
          documentTitle: "Terms",
          documentType: "TERMS_OF_USE",
          version: "1.0",
          versionNumber: 1,
          contentHash: "abc",
          effectiveAt: new Date("2020-01-01"),
          blockingMode: "BLOCKING",
          requiredBy: null,
          tenantId: null,
        },
      ],
      acceptances: [{ documentVersionId: "v1", status: "ACKNOWLEDGED" }],
    });
    expect(pending).toHaveLength(0);
    expect(hasBlockingOutstanding(pending)).toBe(false);
  });
});
