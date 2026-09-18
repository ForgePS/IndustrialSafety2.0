import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteCacheNamesByPrefix,
  deleteIndexedDatabases,
  registerForgeBrowserCleanup,
  removeStorageKeysByPrefix,
  resetForgeBrowserCleanupHandlersForTests,
  runForgeBrowserCleanup,
  type StorageLike,
} from "./forge-browser-cleanup.js";

function memoryStore(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
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

afterEach(() => {
  resetForgeBrowserCleanupHandlersForTests();
});

describe("removeStorageKeysByPrefix", () => {
  it("removes Forge prefixes and leaves unrelated keys", () => {
    const store = memoryStore({
      "forge.ind.offline.v1:a": "1",
      "forge.sanitation.draft.x": "2",
      "unrelated-theme": "dark",
      "forge-ind-theme-mode": "light",
    });
    const removed = removeStorageKeysByPrefix(store, [
      "forge.ind.offline.v1:",
      "forge.sanitation.draft.",
    ]);
    expect(removed).toBe(2);
    expect(store.getItem("unrelated-theme")).toBe("dark");
    expect(store.getItem("forge-ind-theme-mode")).toBe("light");
    expect(store.getItem("forge.ind.offline.v1:a")).toBeNull();
  });
});

describe("runForgeBrowserCleanup", () => {
  it("invokes registered handlers for logout and tenant-switch", async () => {
    const seen: string[] = [];
    registerForgeBrowserCleanup((reason) => {
      seen.push(reason);
    });
    await runForgeBrowserCleanup("logout");
    await runForgeBrowserCleanup("tenant-switch");
    expect(seen).toEqual(["logout", "tenant-switch"]);
  });

  it("continues when a handler throws", async () => {
    registerForgeBrowserCleanup(() => {
      throw new Error("boom");
    });
    const ok = vi.fn();
    registerForgeBrowserCleanup(ok);
    await expect(runForgeBrowserCleanup("logout")).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledWith("logout");
  });
});

describe("deleteIndexedDatabases / deleteCacheNamesByPrefix", () => {
  it("no-ops safely when APIs are missing", async () => {
    expect(await deleteIndexedDatabases(["forge-field-offline"])).toBeGreaterThanOrEqual(0);
    expect(await deleteCacheNamesByPrefix(["forge-field-shell"])).toBeGreaterThanOrEqual(0);
  });
});
