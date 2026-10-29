import { describe, expect, it } from "vitest";
import {
  DUPLICATE_ACTIONS,
  IMPORT_AUDIT_EVENT_TYPES,
  IMPORT_FORMATS,
  IMPORT_JOB_STATUSES,
  IMPORT_PERMISSIONS,
  assertImportAuditSafe,
  assertImportPermission,
  createImportAuditEvent,
  hasImportPermission,
  listImportPermissions,
  notImplemented,
  tenantAdminImportPermissions,
  StubFileDetector,
  StubDuplicateDetector,
} from "./index.js";

describe("@forge/imports S1 foundation", () => {
  it("exports canonical job statuses", () => {
    expect(IMPORT_JOB_STATUSES).toContain("UPLOADED");
    expect(IMPORT_JOB_STATUSES).toContain("SCAN_FAILED");
    expect(IMPORT_JOB_STATUSES).toContain("COMPLETED_WITH_ERRORS");
    expect(IMPORT_JOB_STATUSES).toContain("ROLLBACK_REFUSED");
    expect(IMPORT_JOB_STATUSES).not.toContain("DRAFT");
  });

  it("exports formats and duplicate actions", () => {
    expect(IMPORT_FORMATS).toEqual(expect.arrayContaining(["csv", "xlsx", "json", "zip", "api"]));
    expect(DUPLICATE_ACTIONS).toContain("MERGE_REVIEW");
  });

  it("seeds twelve import permissions without platform/tenant prefix", () => {
    expect(listImportPermissions()).toHaveLength(12);
    for (const code of IMPORT_PERMISSIONS) {
      expect(code.startsWith("import.")).toBe(true);
      expect(code.startsWith("platform.")).toBe(false);
      expect(code.startsWith("tenant.")).toBe(false);
    }
  });

  it("limits tenant-admin import grants (no sensitive / template.manage)", () => {
    const ta = tenantAdminImportPermissions();
    expect(ta).not.toContain("import.sensitive");
    expect(ta).not.toContain("import.template.manage");
    expect(ta).toContain("import.execute");
  });

  it("enforces permission checks independently", () => {
    const held = new Set(["import.view", "import.upload"]);
    expect(hasImportPermission(held, "import.view")).toBe(true);
    expect(hasImportPermission(held, "import.execute")).toBe(false);
    expect(() => assertImportPermission(held, "import.execute")).toThrow(
      /Missing import permission/,
    );
  });

  it("defines audit event types and rejects sensitive audit details", () => {
    expect(IMPORT_AUDIT_EVENT_TYPES).toContain("ImportJobCreated");
    expect(IMPORT_AUDIT_EVENT_TYPES).toContain("ImportSensitiveFieldAccessed");
    expect(() => assertImportAuditSafe({ ssn: "123" })).toThrow();
    const event = createImportAuditEvent({
      eventId: "e1",
      eventType: "ImportJobCreated",
      tenantId: "t1",
      actorUserId: "u1",
      correlationId: "c1",
      importJobId: "j1",
      outcome: "SUCCESS",
      details: { format: "csv" },
    });
    expect(event.eventVersion).toBe(1);
    expect(event.outcome).toBe("SUCCESS");
  });

  it("structure detector rejects empty uploads and stubs remain for other stages", async () => {
    const detector = new StubFileDetector();
    await expect(
      detector.detect({ bytes: new Uint8Array(), fileName: "x.csv" }),
    ).rejects.toMatchObject({ code: "IMPORT_FORMAT_INVALID" });
    expect(() => notImplemented("test")).toThrow(/NOT_IMPLEMENTED/);
    const dup = new StubDuplicateDetector();
    await expect(
      dup.detect([], { productCode: "x", moduleCode: "y", recordType: "z" }, "t"),
    ).resolves.toEqual([]);
  });
});
