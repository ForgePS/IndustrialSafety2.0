import { describe, expect, it } from "vitest";
import { clearAllOfflineData, OfflineCache, type CacheStore } from "./cache";
import { classifyDomain, isCacheable } from "./data-classification";
import { resolveConflict } from "./conflict";
import { MutationQueue } from "./mutation-queue";

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

describe("offline data classification", () => {
  it("defaults unclassified domains to NEVER_CACHE", () => {
    expect(classifyDomain("industrial.brand.new").offlineClass).toBe("NEVER_CACHE");
    expect(isCacheable("industrial.brand.new")).toBe(false);
  });

  it("never caches documents, exports, or auth", () => {
    for (const domain of ["platform.documents", "platform.exports", "platform.auth"]) {
      expect(isCacheable(domain)).toBe(false);
    }
  });

  it("allows read-only offline access to approved LOTO procedures", () => {
    const policy = classifyDomain("industrial.loto.procedures");
    expect(policy.offlineClass).toBe("OFFLINE_REQUIRED");
    expect(policy.queueMutations).toBe(false);
  });
  it("allows offline sanitation inspection capture with queued mutations", () => {
    const policy = classifyDomain("industrial.sanitation");
    expect(policy.offlineClass).toBe("USEFUL");
    expect(policy.queueMutations).toBe(true);
  });

  it("caches sanitation templates read-only offline", () => {
    const policy = classifyDomain("industrial.sanitation.templates");
    expect(policy.offlineClass).toBe("OFFLINE_REQUIRED");
    expect(policy.queueMutations).toBe(false);
  });
});

describe("offline cache", () => {
  it("refuses to store NEVER_CACHE domains", () => {
    const cache = new OfflineCache(scopeA, memoryStore());
    expect(cache.set("platform.documents", "doc-1", { name: "x" })).toBe(false);
    expect(cache.get("platform.documents", "doc-1")).toBeNull();
  });

  it("does not return entries from another tenant scope", () => {
    const store = memoryStore();
    new OfflineCache(scopeA, store).set("industrial.equipment", "eq-1", { tag: "A" });
    const other = new OfflineCache({ tenantId: "tenant-b", userId: "user-a" }, store);
    expect(other.get("industrial.equipment", "eq-1")).toBeNull();
  });

  it("expires entries past the domain max age", () => {
    const store = memoryStore();
    const cache = new OfflineCache(scopeA, store);
    cache.set("industrial.tasks", "list", [1, 2], 0);
    expect(cache.get("industrial.tasks", "list", 1)).toEqual([1, 2]);
    expect(cache.get("industrial.tasks", "list", 60 * 60_000 + 1)).toBeNull();
  });

  it("clears every scope on logout", () => {
    const store = memoryStore();
    new OfflineCache(scopeA, store).set("industrial.equipment", "eq-1", { tag: "A" });
    new OfflineCache({ tenantId: "tenant-b", userId: "user-b" }, store).set(
      "industrial.equipment",
      "eq-2",
      { tag: "B" },
    );
    expect(clearAllOfflineData(store)).toBe(2);
    expect(store.length).toBe(0);
  });
});

describe("mutation queue", () => {
  it("rejects domains that do not accept offline mutations", () => {
    const queue = new MutationQueue(scopeA, memoryStore());
    const result = queue.enqueue({
      id: "m1",
      domain: "industrial.loto.procedures",
      operation: "update",
      payload: {},
      correlationId: "c1",
    });
    expect(result.ok).toBe(false);
  });

  it("queues inspection mutations and replays oldest first", () => {
    const queue = new MutationQueue(scopeA, memoryStore());
    queue.enqueue(
      {
        id: "m2",
        domain: "industrial.inspections",
        operation: "create",
        payload: {},
        correlationId: "c2",
      },
      200,
    );
    queue.enqueue(
      {
        id: "m1",
        domain: "industrial.inspections",
        operation: "create",
        payload: {},
        correlationId: "c1",
      },
      100,
    );
    expect(queue.pending().map((item) => item.id)).toEqual(["m1", "m2"]);
  });
});

describe("conflict resolution", () => {
  it("rejects stale writes against approved LOTO procedures", () => {
    const decision = resolveConflict({
      domain: "industrial.loto.procedures",
      operation: "update",
      baseVersion: 3,
      serverVersion: 3,
      serverApproved: true,
    });
    expect(decision.strategy).toBe("REJECT_STALE_WRITE");
    expect(decision.autoApply).toBe(false);
  });

  it("requires human review when a safety record moved on", () => {
    const decision = resolveConflict({
      domain: "industrial.inspections",
      operation: "update",
      baseVersion: 2,
      serverVersion: 5,
    });
    expect(decision.strategy).toBe("CLIENT_REVIEW_REQUIRED");
    expect(decision.autoApply).toBe(false);
  });

  it("never auto-applies a stale write outside the clean case", () => {
    const decision = resolveConflict({
      domain: "industrial.tasks",
      operation: "update",
      baseVersion: 1,
      serverVersion: 4,
    });
    expect(decision.strategy).toBe("SERVER_WINS");
    expect(decision.autoApply).toBe(false);
  });
});
