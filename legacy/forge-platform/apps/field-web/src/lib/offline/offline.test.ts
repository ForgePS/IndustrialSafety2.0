import { describe, expect, it } from "vitest";
import { classifyDomain, isCacheable, acceptsQueuedMutations } from "./data-classification";
import { resolveConflict } from "./conflict";
import {
  FieldMutationQueue,
  migrateLegacySanitationQueue,
  LEGACY_SANITATION_QUEUE_KEY,
  type CacheStore,
} from "./mutation-queue";
import { FieldOfflineCache, clearAllOfflineData } from "./cache";
import {
  setOfflineScope,
  pendingOfflineCount,
  enqueueOfflineMutation,
  flushOfflineQueue,
} from "./sync";

function memoryStore(): CacheStore {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

const scopeA = { tenantId: "tenant-a", userId: "user-a" };

describe("field offline classification", () => {
  it("defaults unclassified domains to NEVER_CACHE", () => {
    expect(classifyDomain("industrial.brand.new").offlineClass).toBe("NEVER_CACHE");
    expect(isCacheable("industrial.brand.new")).toBe(false);
  });

  it("requires emergency procedures offline and does not queue them", () => {
    const policy = classifyDomain("industrial.emergency_response");
    expect(policy.offlineClass).toBe("OFFLINE_REQUIRED");
    expect(policy.queueMutations).toBe(false);
  });

  it("queues sanitation, observations, and form submissions", () => {
    expect(acceptsQueuedMutations("industrial.sanitation")).toBe(true);
    expect(acceptsQueuedMutations("industrial.observations")).toBe(true);
    expect(acceptsQueuedMutations("industrial.forms.submissions")).toBe(true);
    expect(acceptsQueuedMutations("industrial.incidents")).toBe(false);
  });
});

describe("field offline cache", () => {
  it("refuses NEVER_CACHE domains", () => {
    const cache = new FieldOfflineCache(scopeA, memoryStore());
    expect(cache.set("platform.auth", "token", { x: 1 })).toBe(false);
    expect(cache.get("platform.auth", "token")).toBeNull();
  });

  it("scopes cache by tenant", () => {
    const store = memoryStore();
    new FieldOfflineCache(scopeA, store).set("industrial.equipment", "eq-1", { tag: "A" });
    const other = new FieldOfflineCache({ tenantId: "tenant-b", userId: "user-a" }, store);
    expect(other.get("industrial.equipment", "eq-1")).toBeNull();
  });

  it("clears offline data on logout helper", () => {
    const store = memoryStore();
    new FieldOfflineCache(scopeA, store).set("industrial.equipment", "eq-1", { tag: "A" });
    expect(clearAllOfflineData(store)).toBeGreaterThan(0);
  });
});

describe("field mutation queue", () => {
  it("rejects domains that do not accept offline mutations", () => {
    const queue = new FieldMutationQueue(scopeA, memoryStore());
    const result = queue.enqueue({
      domain: "industrial.incidents",
      method: "POST",
      path: "/api/v1/industrial/incidents",
      body: { title: "x" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DOMAIN_NOT_QUEUEABLE");
  });

  it("enqueues sanitation mutations and reports pending count", () => {
    const store = memoryStore();
    const queue = new FieldMutationQueue(scopeA, store);
    const result = queue.enqueue({
      id: "m1",
      domain: "industrial.sanitation",
      method: "POST",
      path: "/api/v1/industrial/sanitation/inspections",
      body: { offlineClientId: "local-1" },
      offlineClientId: "local-1",
    });
    expect(result.ok).toBe(true);
    expect(queue.pendingCount()).toBe(1);
  });

  it("migrates legacy sanitation queue items", () => {
    const store = memoryStore();
    store.setItem(
      LEGACY_SANITATION_QUEUE_KEY,
      JSON.stringify([
        {
          id: "legacy-1",
          method: "POST",
          path: "/api/v1/industrial/sanitation/inspections",
          body: { title: "daily" },
          createdAt: new Date().toISOString(),
          offlineClientId: "oc-1",
        },
      ]),
    );
    const queue = new FieldMutationQueue(scopeA, store);
    expect(migrateLegacySanitationQueue(queue, store)).toBe(1);
    expect(queue.pendingCount()).toBe(1);
    expect(store.getItem(LEGACY_SANITATION_QUEUE_KEY)).toBeNull();
  });
});

describe("field conflict policy", () => {
  it("auto-applies matching versions and requires review for inspections", () => {
    expect(
      resolveConflict({
        domain: "industrial.sanitation",
        operation: "update",
        baseVersion: 2,
        serverVersion: 2,
      }).autoApply,
    ).toBe(true);
    expect(
      resolveConflict({
        domain: "industrial.inspections",
        operation: "update",
        baseVersion: 1,
        serverVersion: 2,
      }).strategy,
    ).toBe("CLIENT_REVIEW_REQUIRED");
  });
});

describe("field sync scope helpers", () => {
  it("requires scope before counting or enqueueing on the shared engine", () => {
    setOfflineScope(null);
    expect(pendingOfflineCount()).toBe(0);
    const result = enqueueOfflineMutation({
      domain: "industrial.observations",
      method: "POST",
      path: "/api/v1/industrial/observations",
      body: { title: "hazard" },
    });
    expect(result.ok).toBe(false);
  });

  it("flush returns zeros when offline or empty", async () => {
    setOfflineScope(scopeA);
    const result = await flushOfflineQueue(scopeA);
    expect(result.flushed).toBe(0);
  });
});

describe("dexie memory store", () => {
  it("implements CacheStore for offline queue/cache", async () => {
    const { MemoryCacheStore, setOfflineStoreForTests } = await import("./dexie-store");
    const store = new MemoryCacheStore();
    store.setItem("a", "1");
    expect(store.getItem("a")).toBe("1");
    expect(store.length).toBe(1);
    expect(store.key(0)).toBe("a");
    store.removeItem("a");
    expect(store.getItem("a")).toBeNull();
    setOfflineStoreForTests(store);
    setOfflineScope(scopeA);
    const queued = enqueueOfflineMutation({
      domain: "industrial.observations",
      method: "POST",
      path: "/api/v1/industrial/observations",
      body: { title: "dexie" },
    });
    expect(queued.ok).toBe(true);
    expect(pendingOfflineCount()).toBeGreaterThan(0);
    setOfflineScope(null);
    setOfflineStoreForTests(null);
  });
});
