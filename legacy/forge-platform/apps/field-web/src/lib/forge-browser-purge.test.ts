import { describe, expect, it } from "vitest";
import {
  FIELD_CACHE_NAME_PREFIXES,
  FIELD_FORGE_LOCAL_PREFIXES,
  FIELD_INDEXED_DB_NAMES,
} from "./forge-browser-purge";
import { removeStorageKeysByPrefix, type StorageLike } from "@forge/web-kit";

function memoryStore(initial: Record<string, string>): StorageLike {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

describe("field forge browser purge inventory", () => {
  it("clears offline, drafts, and org cache prefixes while keeping theme", () => {
    const store = memoryStore({
      "forge.field.offline.v1:t:u:x": "1",
      "forge.field.report.draft.v1:abc": "2",
      "forge.field.theme-mode": "dark",
    });
    removeStorageKeysByPrefix(store, FIELD_FORGE_LOCAL_PREFIXES);
    expect(store.getItem("forge.field.offline.v1:t:u:x")).toBeNull();
    expect(store.getItem("forge.field.report.draft.v1:abc")).toBeNull();
    expect(store.getItem("forge.field.theme-mode")).toBe("dark");
  });

  it("targets the Dexie DB and shell cache name prefixes", () => {
    expect(FIELD_INDEXED_DB_NAMES).toContain("forge-field-offline");
    expect(FIELD_CACHE_NAME_PREFIXES.some((p) => p.startsWith("forge-field-shell"))).toBe(true);
  });
});
