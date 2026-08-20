import { describe, expect, it } from "vitest";
import {
  assertTransition,
  comparePayloads,
  hashConfigPayload,
  resolveEffectiveVersion,
  resolveLoginBranding,
  validateConfigPayload,
} from "./index.js";

describe("@forge/configuration", () => {
  it("validates branding payload", () => {
    const parsed = validateConfigPayload("branding", {
      primaryColor: "#14532d",
      emailFromName: "Forge",
    });
    expect(parsed).toMatchObject({ primaryColor: "#14532d" });
  });

  it("hashes payloads stably", () => {
    expect(hashConfigPayload({ a: 1 })).toBe(hashConfigPayload({ a: 1 }));
  });

  it("enforces lifecycle transitions", () => {
    expect(() => assertTransition("DRAFT", "PUBLISHED")).not.toThrow();
    expect(() => assertTransition("PUBLISHED", "DRAFT")).toThrow();
  });

  it("compares payloads", () => {
    const diffs = comparePayloads({ a: 1, b: 2 }, { a: 1, b: 3 });
    expect(diffs).toEqual([{ path: "b", left: 2, right: 3 }]);
  });

  it("preserves explicit empty login statusText", () => {
    expect(resolveLoginBranding({ login: { statusText: "" } }).statusText).toBe("");
  });

  it("resolves effective published version", () => {
    const now = new Date("2026-07-28T12:00:00Z");
    const effective = resolveEffectiveVersion(
      [
        {
          state: "SUPERSEDED",
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          effectiveTo: new Date("2026-06-01T00:00:00Z"),
          publishedAt: new Date("2026-01-01T00:00:00Z"),
          id: "old",
        },
        {
          state: "PUBLISHED",
          effectiveFrom: new Date("2026-06-01T00:00:00Z"),
          effectiveTo: null,
          publishedAt: new Date("2026-06-01T00:00:00Z"),
          id: "current",
        },
      ],
      now,
    );
    expect(effective?.id).toBe("current");
  });
});
