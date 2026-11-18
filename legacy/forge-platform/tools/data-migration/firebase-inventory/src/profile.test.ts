import { describe, expect, it } from "vitest";
import {
  classifyDrift,
  classifyFirestoreValue,
  detectTenantKeys,
  flattenFields,
  mergeFieldProfiles,
} from "./profile.js";
import { assertAuthorizedProject, EXPECTED_PROJECT, ProjectGuardError } from "./project-guard.js";
import { isSensitiveFieldName, redactValue } from "./redact.js";

describe("PROJECT_GUARD", () => {
  it("accepts forge-industrial-safety", () => {
    expect(() => assertAuthorizedProject(EXPECTED_PROJECT)).not.toThrow();
  });
  it("rejects other projects", () => {
    expect(() => assertAuthorizedProject("firehouse-dashboards")).toThrow(ProjectGuardError);
    expect(() => assertAuthorizedProject("")).toThrow(ProjectGuardError);
  });
});

describe("TYPE_PROFILING", () => {
  it("classifies primitives and nested", () => {
    expect(classifyFirestoreValue("x")).toBe("string");
    expect(classifyFirestoreValue(true)).toBe("boolean");
    expect(classifyFirestoreValue(1)).toBe("integer");
    expect(classifyFirestoreValue(1.5)).toBe("double");
    expect(classifyFirestoreValue(null)).toBe("null");
    expect(classifyFirestoreValue([1])).toBe("array");
    expect(classifyFirestoreValue({ a: 1 })).toBe("map");
  });

  it("TIMESTAMP / GEOPOINT / DOCUMENT_REFERENCE / NESTED_MAP / ARRAY", () => {
    expect(classifyFirestoreValue({ toDate: () => new Date() })).toBe("timestamp");
    expect(classifyFirestoreValue({ latitude: 1, longitude: 2 })).toBe("geopoint");
    expect(classifyFirestoreValue({ path: "a/b", id: "b" })).toBe("reference");
    expect(classifyFirestoreValue(Buffer.from("x"))).toBe("bytes");
    const flat = flattenFields({ outer: { inner: "v" }, tags: ["a"] });
    expect(flat.some((f) => f.fieldName === "outer.inner")).toBe(true);
    expect(flat.some((f) => f.type === "array")).toBe(true);
  });

  it("merges profiles and drift", () => {
    const profiles = mergeFieldProfiles([
      { a: 1, status: "ACTIVE" },
      { a: 1, b: "x", status: "INACTIVE" },
    ]);
    expect(profiles.find((p) => p.fieldName === "a")?.presence).toBe("common");
    expect(profiles.find((p) => p.fieldName === "b")?.presence).toBe("optional");
    expect(["STABLE", "MINOR_DRIFT", "SIGNIFICANT_DRIFT"]).toContain(classifyDrift(profiles, 2));
  });
});

describe("TENANT_KEY_DETECTION", () => {
  it("detects known tenant keys", () => {
    expect(detectTenantKeys(["businessId", "siteId", "foo"])).toEqual(["businessId"]);
    expect(detectTenantKeys(["organizationId", "companyId", "tenantId"]).length).toBe(3);
  });
});

describe("REDACTION", () => {
  it("redacts sensitive fields and emails", () => {
    expect(isSensitiveFieldName("email")).toBe(true);
    expect(redactValue("email", "a@b.com")).toBe("[REDACTED]");
    expect(redactValue("note", "hello@example.com")).toBe("[REDACTED_EMAIL]");
    expect(redactValue("count", 3)).toBe(3);
  });
});

describe("NO_SECRET_OUTPUT", () => {
  it("never returns raw password-like values from redact", () => {
    expect(redactValue("passwordHash", "super-secret")).toBe("[REDACTED]");
    expect(redactValue("refreshToken", "tok")).toBe("[REDACTED]");
  });
});
