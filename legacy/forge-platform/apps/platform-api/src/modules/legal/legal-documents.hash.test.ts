import { describe, expect, it } from "vitest";
import { hashCanonicalContent } from "./legal-evaluator.js";

describe("legal documents hashing", () => {
  it("is deterministic for the same content", () => {
    const a = hashCanonicalContent("<p>Terms</p>");
    const b = hashCanonicalContent("  <p>Terms</p>  ");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
