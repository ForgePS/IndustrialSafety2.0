import { describe, expect, it } from "vitest";
import {
  detectDuplicates,
  validateZipMigrationBundle,
  validateApiImportSourceConfig,
  computeRetryDelayMs,
  extractRecordsFromApiPayload,
  DEFAULT_DUPLICATE_RULES,
} from "./index.js";
import { createHash } from "node:crypto";

describe("S4 duplicate engine", () => {
  it("scores exact externalId as HIGH UPDATE", () => {
    const results = detectDuplicates({
      incoming: [{ sourceRowKey: "r1", fields: { externalId: "A-1", name: "Ada" } }],
      existing: [
        {
          entityId: "019f9c33-288e-7171-8d94-b76c4a4658b6",
          fields: { externalId: "A-1", name: "Ada Lovelace" },
        },
      ],
      rules: DEFAULT_DUPLICATE_RULES,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.confidenceBand).toBe("HIGH");
    expect(results[0]?.recommendedAction).toBe("UPDATE");
    expect(results[0]?.matchAlgorithm).toMatch(/exact|composite/);
  });

  it("is deterministic for the same inputs", () => {
    const input = {
      incoming: [{ sourceRowKey: "r1", fields: { email: "a@x.com", name: "Ann" } }],
      existing: [
        {
          entityId: "019f9c33-288e-7171-8d94-b76c4a4658b6",
          fields: { email: "a@x.com", name: "Anne" },
        },
      ],
    };
    const a = detectDuplicates(input);
    const b = detectDuplicates(input);
    expect(a).toEqual(b);
  });

  it("identifies field conflicts in merge candidates", () => {
    const results = detectDuplicates({
      incoming: [{ sourceRowKey: "r1", fields: { externalId: "1", name: "New" } }],
      existing: [
        {
          entityId: "019f9c33-288e-7171-8d94-b76c4a4658b6",
          fields: { externalId: "1", name: "Old" },
        },
      ],
    });
    expect(results[0]?.conflictFields).toContain("name");
  });
});

describe("S4 ZIP validation", () => {
  function zipStore(name: string, content: string | Buffer): Buffer {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const local = Buffer.alloc(30 + nameBuf.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    data.copy(local, 30 + nameBuf.length);

    // central directory
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 42); // local header offset 0 for first; approximate for tests listing
    nameBuf.copy(central, 46);
    return Buffer.concat([local, central]);
  }

  it("rejects missing manifest", () => {
    const bytes = zipStore("data.csv", "a,b\n1,2\n");
    const result = validateZipMigrationBundle({ bytes });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("IMPORT_ZIP_MANIFEST_MISSING");
  });

  it("accepts valid stored manifest + file", () => {
    const csv = "id,name\n1,Ada\n";
    const sha = createHash("sha256").update(csv).digest("hex");
    const manifest = JSON.stringify({
      version: "1.0",
      productNeutral: true,
      files: [{ path: "data.csv", sha256: sha, required: true }],
    });
    // Build multi-entry archive with correct offsets via sequential local headers + CD
    const entries = [
      { name: "manifest.json", data: Buffer.from(manifest) },
      { name: "data.csv", data: Buffer.from(csv) },
    ];
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
      const nameBuf = Buffer.from(entry.name);
      const local = Buffer.alloc(30 + nameBuf.length + entry.data.length);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt32LE(entry.data.length, 18);
      local.writeUInt32LE(entry.data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      nameBuf.copy(local, 30);
      entry.data.copy(local, 30 + nameBuf.length);
      const central = Buffer.alloc(46 + nameBuf.length);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt32LE(entry.data.length, 20);
      central.writeUInt32LE(entry.data.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt32LE(offset, 42);
      nameBuf.copy(central, 46);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    }
    const bytes = Buffer.concat([...locals, ...centrals]);
    const result = validateZipMigrationBundle({ bytes });
    expect(result.ok).toBe(true);
  });
});

describe("S4 API import framework", () => {
  it("requires https baseUrl", () => {
    const result = validateApiImportSourceConfig({
      baseUrl: "http://example.com",
      path: "/v1/items",
      method: "GET",
      auth: { type: "none" },
      responseRecordsPath: "items",
    });
    expect(result.ok).toBe(false);
  });

  it("normalizes valid config and extracts records", () => {
    const result = validateApiImportSourceConfig({
      baseUrl: "https://example.com",
      path: "/v1/items",
      method: "GET",
      auth: { type: "bearer", tokenRef: "secret/token" },
      responseRecordsPath: "data.items",
    });
    expect(result.ok).toBe(true);
    expect(extractRecordsFromApiPayload({ data: { items: [{ id: 1 }] } }, "data.items")).toEqual([
      { id: 1 },
    ]);
    expect(
      computeRetryDelayMs(1, {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        retryOnStatus: [429],
      }),
    ).toBe(100);
  });
});
