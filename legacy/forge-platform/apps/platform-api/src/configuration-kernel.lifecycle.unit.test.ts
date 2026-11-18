import { describe, expect, it } from "vitest";
import {
  assertTransition,
  comparePayloads,
  CONFIG_NAMESPACES,
  DEFAULT_PAYLOADS,
  hashConfigPayload,
  resolveEffectiveVersion,
  validateConfigPayload,
  type ConfigNamespace,
} from "@forge/configuration";

describe("configuration kernel lifecycle (pure)", () => {
  it("validates create-draft payloads for a namespace", () => {
    const namespace: ConfigNamespace = "branding";
    const draft = {
      ...DEFAULT_PAYLOADS[namespace],
      primaryColor: "#0f766e",
      emailFromName: "Draft Forge",
    };
    const parsed = validateConfigPayload(namespace, draft);
    expect(parsed).toMatchObject({
      primaryColor: "#0f766e",
      emailFromName: "Draft Forge",
    });
  });

  it("hashes payloads stably", () => {
    const payload = { a: 1, nested: { b: "x" } };
    expect(hashConfigPayload(payload)).toBe(hashConfigPayload(payload));
    expect(hashConfigPayload(payload)).toBe(hashConfigPayload({ a: 1, nested: { b: "x" } }));
    expect(hashConfigPayload(payload)).toHaveLength(64);
  });

  it("compares payloads and reports diffs", () => {
    const diffs = comparePayloads(
      { a: 1, b: { c: 2 }, d: "same" },
      { a: 1, b: { c: 3 }, d: "same" },
    );
    expect(diffs).toEqual([{ path: "b.c", left: 2, right: 3 }]);
    expect(comparePayloads({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it("allows DRAFT->PUBLISHED, DRAFT->SCHEDULED, PUBLISHED->SUPERSEDED", () => {
    expect(() => assertTransition("DRAFT", "PUBLISHED")).not.toThrow();
    expect(() => assertTransition("DRAFT", "SCHEDULED")).not.toThrow();
    expect(() => assertTransition("PUBLISHED", "SUPERSEDED")).not.toThrow();
  });

  it("rejects PUBLISHED->DRAFT", () => {
    expect(() => assertTransition("PUBLISHED", "DRAFT")).toThrow(
      /Invalid config version transition PUBLISHED -> DRAFT/,
    );
  });

  it("resolveEffectiveVersion ignores future SCHEDULED and picks PUBLISHED", () => {
    const now = new Date("2026-07-28T12:00:00Z");
    const effective = resolveEffectiveVersion(
      [
        {
          id: "future-scheduled",
          state: "SCHEDULED",
          effectiveFrom: new Date("2026-08-01T00:00:00Z"),
          effectiveTo: null,
          publishedAt: new Date("2026-07-20T00:00:00Z"),
        },
        {
          id: "live-published",
          state: "PUBLISHED",
          effectiveFrom: new Date("2026-06-01T00:00:00Z"),
          effectiveTo: null,
          publishedAt: new Date("2026-06-01T00:00:00Z"),
        },
        {
          id: "old-superseded",
          state: "SUPERSEDED",
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          effectiveTo: new Date("2026-06-01T00:00:00Z"),
          publishedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      now,
    );
    expect(effective?.id).toBe("live-published");
  });

  it("validates DEFAULT_PAYLOADS for all CONFIG_NAMESPACES", () => {
    expect(CONFIG_NAMESPACES.length).toBeGreaterThan(0);
    for (const namespace of CONFIG_NAMESPACES) {
      expect(() => validateConfigPayload(namespace, DEFAULT_PAYLOADS[namespace])).not.toThrow();
    }
  });
});
