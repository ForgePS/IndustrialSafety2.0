import { describe, expect, it } from "vitest";
import { awsAccountIdSchema, ssnLastFourSchema, uuidSchema } from "./index.js";

describe("validation", () => {
  it("accepts uuid", () => {
    expect(uuidSchema.parse("550e8400-e29b-41d4-a716-446655440000")).toBeTruthy();
  });

  it("accepts aws account id", () => {
    expect(awsAccountIdSchema.parse("000000000000")).toBe("000000000000");
  });

  it("accepts ssn last four only", () => {
    expect(ssnLastFourSchema.parse("1234")).toBe("1234");
    expect(() => ssnLastFourSchema.parse("123-45-6789")).toThrow();
  });
});
