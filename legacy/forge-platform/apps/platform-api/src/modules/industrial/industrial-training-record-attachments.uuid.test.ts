import { describe, expect, it } from "vitest";
import { createId } from "@forge/database";

/** Same pattern used by training record attachment completeUpload. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_STRICT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("training record attachment documentId UUID check", () => {
  it("accepts createId() UUIDv7 values that the old RFC 4122 v1-5 regex rejected", () => {
    const id = createId();
    expect(id[14]).toBe("7");
    expect(LEGACY_STRICT.test(id)).toBe(false);
    expect(UUID_PATTERN.test(id)).toBe(true);
  });

  it("still accepts classic UUID v4 shapes", () => {
    expect(UUID_PATTERN.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });
});
