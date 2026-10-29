import { describe, expect, it } from "vitest";
import {
  actionAllowed,
  clearImportTenantCache,
  dashboardStatusBuckets,
  disposeDownloadUrl,
  formatImportError,
  getActiveDownloadUrlForTests,
  importCacheTenantCount,
  isDownloadExpired,
  resolveImportWorkflowView,
  sanitizeErrorMessage,
  serializeJobFilters,
  setCachedJobs,
  ALL_IMPORT_FIXTURES,
  parseMissingOrgLookupHint,
} from "./index.js";

describe("import state router", () => {
  it("maps server statuses to workflow views", () => {
    expect(resolveImportWorkflowView("UPLOADED")).toBe("upload");
    expect(resolveImportWorkflowView("SCANNING")).toBe("security");
    expect(resolveImportWorkflowView("QUARANTINED")).toBe("quarantine");
    expect(resolveImportWorkflowView("READY_FOR_MAPPING")).toBe("mapping");
    expect(resolveImportWorkflowView("AWAITING_APPROVAL")).toBe("approval");
    expect(resolveImportWorkflowView("APPROVED")).toBe("execute");
    expect(resolveImportWorkflowView("PROCESSING")).toBe("execution");
    expect(resolveImportWorkflowView("COMPLETED")).toBe("results");
  });
});

describe("permissions and filters", () => {
  it("gates actions by permission checker", () => {
    const allow = (code: string) => code === "import.view";
    expect(actionAllowed(allow, "import.view")).toBe(true);
    expect(actionAllowed(allow, "import.execute")).toBe(false);
  });

  it("serializes job filters for server queries", () => {
    expect(serializeJobFilters({ page: 2, pageSize: 10, status: "FAILED" })).toEqual({
      page: "2",
      pageSize: "10",
      search: undefined,
      status: "FAILED",
      productKey: undefined,
      moduleKey: undefined,
      recordCategory: undefined,
      sort: "createdAt",
      sortDir: "desc",
    });
  });

  it("computes dashboard buckets", () => {
    const buckets = dashboardStatusBuckets(["READY_FOR_MAPPING", "QUARANTINED", "PROCESSING"]);
    expect(buckets.awaitingMapping).toBe(1);
    expect(buckets.quarantined).toBe(1);
    expect(buckets.processing).toBe(1);
  });
});

describe("safe errors and downloads", () => {
  it("sanitizes unsafe error text", () => {
    expect(sanitizeErrorMessage("s3://bucket/key")).toContain("secure operation");
    expect(formatImportError(new Error("boom")).message).toBe("boom");
  });

  it("disposes download URLs and detects expiry", () => {
    disposeDownloadUrl();
    expect(getActiveDownloadUrlForTests()).toBeNull();
    expect(isDownloadExpired("2000-01-01T00:00:00.000Z")).toBe(true);
  });
});

describe("tenant cache", () => {
  it("clears cached jobs on tenant switch helper", () => {
    setCachedJobs("tenant-a", [ALL_IMPORT_FIXTURES.cleanCsv]);
    expect(importCacheTenantCount()).toBeGreaterThan(0);
    clearImportTenantCache("tenant-a");
    clearImportTenantCache();
    expect(importCacheTenantCount()).toBe(0);
  });
});

describe("production scanner restriction banner", () => {
  it("exports ProductionScannerRestrictionBanner", async () => {
    const mod = await import("./components/badges.js");
    expect(typeof mod.ProductionScannerRestrictionBanner).toBe("function");
  });
});

describe("fixtures", () => {
  it("provides neutral fixtures without real PII", () => {
    expect(ALL_IMPORT_FIXTURES.masked.ssn).toContain("***");
    expect(ALL_IMPORT_FIXTURES.neverReturnable.password).toBe("********");
    expect(ALL_IMPORT_FIXTURES.quarantined.status).toBe("QUARANTINED");
  });
});

describe("missing org lookup hints", () => {
  it("parses unknown department and position messages", () => {
    expect(parseMissingOrgLookupHint("Unknown department: Maintenance")).toEqual({
      kind: "department",
      name: "Maintenance",
    });
    expect(parseMissingOrgLookupHint('missing position named "Supervisor"')).toEqual({
      kind: "position",
      name: "Supervisor",
    });
  });
});
