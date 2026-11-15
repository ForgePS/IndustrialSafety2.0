import { describe, expect, it } from "vitest";
import {
  assertTransition,
  comparePayloads,
  CONFIG_NAMESPACES,
  DEFAULT_PAYLOADS,
  hashConfigPayload,
  isConfigNamespace,
  validateConfigPayload,
} from "@forge/configuration";

describe("configuration platform catalog", () => {
  it("covers every studio module namespace", () => {
    expect(CONFIG_NAMESPACES.length).toBe(27);
    for (const namespace of CONFIG_NAMESPACES) {
      expect(isConfigNamespace(namespace)).toBe(true);
      expect(() => validateConfigPayload(namespace, DEFAULT_PAYLOADS[namespace])).not.toThrow();
    }
  });

  it("supports publish lifecycle and compare", () => {
    expect(() => assertTransition("DRAFT", "PUBLISHED")).not.toThrow();
    expect(() => assertTransition("DRAFT", "SCHEDULED")).not.toThrow();
    expect(hashConfigPayload({ a: 1 }).length).toBe(64);
    expect(comparePayloads({ a: 1 }, { a: 2 })).toHaveLength(1);
  });
});
