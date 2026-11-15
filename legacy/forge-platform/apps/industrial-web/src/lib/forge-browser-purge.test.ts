import { describe, expect, it } from "vitest";
import {
  INDUSTRIAL_FORGE_LOCAL_PREFIXES,
  INDUSTRIAL_FORGE_SESSION_PREFIXES,
  purgeIndustrialForgeBrowserState,
} from "./forge-browser-purge";
import { removeStorageKeysByPrefix, type StorageLike } from "@forge/web-kit";

function memoryStore(initial: Record<string, string>): StorageLike & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
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

describe("industrial forge browser purge", () => {
  it("removes tenant offline and draft keys but keeps theme prefs", () => {
    const store = memoryStore({
      "forge.ind.offline.v1:t:u:domain:k": "{}",
      "forge.sanitation.draft.abc": "{}",
      "forge-ind-theme-mode": "dark",
      "forge-ind-nav-open-groups-v2": "[]",
    });
    const removed = removeStorageKeysByPrefix(store, INDUSTRIAL_FORGE_LOCAL_PREFIXES);
    expect(removed).toBe(2);
    expect(store.getItem("forge-ind-theme-mode")).toBe("dark");
    expect(store.getItem("forge-ind-nav-open-groups-v2")).toBe("[]");
  });

  it("session prefixes include walkthrough and training portal keys", () => {
    expect(INDUSTRIAL_FORGE_SESSION_PREFIXES).toContain("forge-walkthrough-studio-session");
    expect(INDUSTRIAL_FORGE_SESSION_PREFIXES).toContain("forge-training-portal-session:");
  });

  it("purgeIndustrialForgeBrowserState is safe without window storage", () => {
    const result = purgeIndustrialForgeBrowserState("tenant-switch");
    expect(result.localRemoved).toBeGreaterThanOrEqual(0);
    expect(result.sessionRemoved).toBeGreaterThanOrEqual(0);
  });
});
