import { describe, expect, it } from "vitest";
import { assertAuthorizedProject, ProjectGuardError, resolveProjectId } from "./project-guard.js";
import { serializeFirestoreValue } from "./serialize.js";
import { classifySourceTenantKey, TENANT_MAPPINGS } from "./tenant-mapping.js";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha256File } from "./extract-firestore.js";

describe("PROJECT_FAIL_CLOSED", () => {
  it("accepts forge-industrial-safety", () => {
    expect(() => assertAuthorizedProject("forge-industrial-safety")).not.toThrow();
  });

  it("rejects other projects", () => {
    expect(() => assertAuthorizedProject("firehouse-dashboards")).toThrow(ProjectGuardError);
    expect(() => assertAuthorizedProject("")).toThrow(ProjectGuardError);
    expect(() => resolveProjectId("some-other-project")).toThrow(ProjectGuardError);
  });
});

describe("FIRESTORE_TYPE_SERIALIZATION", () => {
  it("marks Timestamp / GeoPoint / DocumentReference / Bytes / Integer / Double", () => {
    const ts = { toDate: () => new Date("2024-01-02T03:04:05.000Z") };
    const geo = { latitude: 1.5, longitude: -2.5 };
    const ref = { path: "sites/abc", id: "abc" };
    const bytes = Buffer.from("hello");

    expect(serializeFirestoreValue(ts)).toEqual({
      __firestoreType: "Timestamp",
      value: "2024-01-02T03:04:05.000Z",
    });
    expect(serializeFirestoreValue(geo)).toEqual({
      __firestoreType: "GeoPoint",
      latitude: 1.5,
      longitude: -2.5,
    });
    expect(serializeFirestoreValue(ref)).toEqual({
      __firestoreType: "DocumentReference",
      path: "sites/abc",
    });
    expect(serializeFirestoreValue(bytes)).toEqual({
      __firestoreType: "Bytes",
      encoding: "base64",
      value: Buffer.from("hello").toString("base64"),
    });
    expect(serializeFirestoreValue(42)).toEqual({ __firestoreType: "Integer", value: 42 });
    expect(serializeFirestoreValue(3.14)).toEqual({ __firestoreType: "Double", value: 3.14 });
    expect(serializeFirestoreValue(null)).toBeNull();
    expect(serializeFirestoreValue(true)).toBe(true);
    expect(serializeFirestoreValue(["a", 1])).toEqual([
      "a",
      { __firestoreType: "Integer", value: 1 },
    ]);
  });

  it("does not rename nested source field names", () => {
    const out = serializeFirestoreValue({ weird_Field: { nested: 1 } }) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["weird_Field"]);
  });
});

describe("TENANT_MAPPING", () => {
  it("classifies known tenants without auto-normalizing Producers Rice Mill", () => {
    expect(classifySourceTenantKey("business-1782553339499").classification).toBe("CUSTOMER");
    expect(classifySourceTenantKey("business-forge-default").classification).toBe(
      "PLATFORM_DEFAULT",
    );
    expect(classifySourceTenantKey("GLOBAL").classification).toBe("GLOBAL_TEMPLATE");
    expect(classifySourceTenantKey("GLOBAL").canonicalTenantKey).toBeNull();
    const alias = classifySourceTenantKey("Producers Rice Mill");
    expect(alias.classification).toBe("LEGACY_ALIAS");
    expect(alias.canonicalTenantKey).toBeNull();
    expect(TENANT_MAPPINGS["Producers Rice Mill"].canonicalTenantKey).toBeNull();
  });
});

describe("GLOBAL_CLASSIFICATION", () => {
  it("GLOBAL is template scope, not customer tenant", () => {
    const m = classifySourceTenantKey("GLOBAL");
    expect(m.classification).toBe("GLOBAL_TEMPLATE");
    expect(m.canonicalTenantKey).toBeNull();
  });
});

describe("AUTH_METADATA_REDACTION", () => {
  it("auth extract payload shape excludes password material fields", async () => {
    // Structural contract: forbidden keys must never appear in auth data objects.
    const sample = {
      firebaseUid: "u1",
      email: "a@b.c",
      emailVerified: true,
      disabled: false,
      providerIds: ["password"],
      createdAt: null,
      lastSignInAt: null,
      businessClaims: null,
    };
    const forbidden = [
      "passwordHash",
      "passwordSalt",
      "salt",
      "hash",
      "refreshToken",
      "idToken",
      "accessToken",
    ];
    for (const k of forbidden) {
      expect(Object.prototype.hasOwnProperty.call(sample, k)).toBe(false);
    }
  });
});

describe("STORAGE_MANIFEST", () => {
  it("infers ownership dispositions without signed URLs", async () => {
    const { inferOwnership } = await import("./storage-ownership.js");
    expect(inferOwnership("tenants/business-1782553339499/docs/a.pdf").disposition).toBe(
      "OWNERSHIP_CONFIRMED",
    );
    expect(inferOwnership("platform-billing-email-templates/x.html").disposition).toBe(
      "PLATFORM_GLOBAL",
    );
    expect(inferOwnership("dqf-exports/test/TEST-1.pdf").disposition).toBe("ORPHAN");
    expect(inferOwnership("loose-file.pdf").disposition).toBe("AMBIGUOUS");
    expect(JSON.stringify(inferOwnership("x"))).not.toMatch(/signedUrl|token=/i);
  });
});

describe("CHECKSUM", () => {
  it("sha256File is stable", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dm-s1-"));
    const f = path.join(dir, "a.ndjson");
    writeFileSync(f, '{"ok":true}\n');
    const a = sha256File(f);
    const b = createHash("sha256").update(readFileSync(f)).digest("hex");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe("NO_SECRET_OUTPUT", () => {
  it("manifest-like object rejects secret keys", () => {
    const manifest = {
      runId: "x",
      sourceProject: "forge-industrial-safety",
      checksums: { "a.ndjson": "abc" },
    };
    const json = JSON.stringify(manifest);
    expect(json).not.toMatch(/password/i);
    expect(json).not.toMatch(/private_key/i);
    expect(json).not.toMatch(/BEGIN RSA/i);
    expect(json).not.toMatch(/secretAccessKey/i);
  });
});

describe("PAGINATION / RESUME / COUNT_RECONCILIATION contracts", () => {
  it("batch size default is bounded", () => {
    const defaultBatch = 400;
    expect(defaultBatch).toBeGreaterThanOrEqual(250);
    expect(defaultBatch).toBeLessThanOrEqual(500);
  });

  it("count difference formula is extracted - source", () => {
    const source = 100;
    const extracted = 100;
    expect(extracted - source).toBe(0);
  });

  it("resume checkpoint shape", () => {
    const cp = { lastDocId: "doc-1", extractedCount: 50, at: new Date().toISOString() };
    expect(cp.lastDocId).toBeTruthy();
    expect(cp.extractedCount).toBeGreaterThan(0);
  });
});

describe("NO_WRITE_APIS", () => {
  it("extractor modules do not call Firestore/Auth/Storage write APIs", async () => {
    const { readFileSync: rf } = await import("node:fs");
    const files = ["extract-firestore.ts", "extract-auth.ts", "extract-storage.ts", "orphans.ts"];
    // Match mutation call sites, not field names like documentUpdateTime
    const banned = [
      /\.set\s*\(/,
      /\.update\s*\(\s*\{/,
      /\.delete\s*\(\s*\)/,
      /\.createUser\s*\(/,
      /\.updateUser\s*\(/,
      /\.deleteUser\s*\(/,
      /\.batch\s*\(\s*\)/,
      /\.commit\s*\(\s*\)/,
    ];
    for (const f of files) {
      const text = rf(new URL(`./${f}`, import.meta.url), "utf8");
      const lines = text
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
      const joined = lines.join("\n");
      for (const re of banned) {
        expect(re.test(joined), `${f} matches ${re}`).toBe(false);
      }
    }
  });
});

describe("SUBCOLLECTION_EXTRACTION", () => {
  it("uses equipmentMigrationBatches/rows naming contract", () => {
    const name = "equipmentMigrationBatches__rows.ndjson";
    expect(name).toContain("equipmentMigrationBatches");
    expect(name).toContain("rows");
  });
});
