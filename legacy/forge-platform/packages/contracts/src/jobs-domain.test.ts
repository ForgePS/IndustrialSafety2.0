import { describe, expect, it } from "vitest";
import {
  EXPORT_KIND_TO_JOB_TYPE,
  EXPORT_SYNC_ROW_LIMIT,
  createExportInputSchema,
} from "./exports-domain.js";
import { listPlatformJobsQuerySchema, PLATFORM_JOB_STATUSES } from "./jobs-domain.js";

describe("jobs-domain (MK-S19)", () => {
  it("defaults list limit", () => {
    expect(listPlatformJobsQuerySchema.parse({}).limit).toBe(25);
  });

  it("includes foundation statuses", () => {
    expect(PLATFORM_JOB_STATUSES).toContain("QUEUED");
    expect(PLATFORM_JOB_STATUSES).toContain("SUCCEEDED");
  });
});

describe("exports-domain (MK-S19)", () => {
  it("maps export kinds to job types", () => {
    expect(EXPORT_KIND_TO_JOB_TYPE["memberships.csv"]).toBe("export.memberships.csv");
  });

  it("parses create export input", () => {
    expect(createExportInputSchema.parse({ kind: "audit.json" }).asyncPreferred).toBe(false);
  });

  it("defines sync row limit for async switch", () => {
    expect(EXPORT_SYNC_ROW_LIMIT).toBeGreaterThan(100);
  });
});
