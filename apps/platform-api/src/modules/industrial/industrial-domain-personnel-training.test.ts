import { describe, expect, it, vi } from "vitest";

// Record every eq(column, value) the service builds so the test can see which id
// each query filters on. The real eq still runs, so query building is unchanged.
const eqCalls = vi.hoisted(() => [] as Array<[unknown, unknown]>);
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (column: unknown, value: unknown) => {
      eqCalls.push([column, value]);
      return actual.eq(column as never, value as never);
    },
  };
});

import { industrialPersonnel, industrialTrainingRecords } from "@forge/database";
import { IndustrialDomainService } from "./industrial-domain.service.js";

const TENANT_ID = "019ff7d0-c20f-7659-81e4-c0cd68e23262";
const RECORD_ID = "5f0c2a8e-3a4b-4c7d-9e1f-2b3c4d5e6f70";
const EMPLOYEE_NUMBER = "EMP-1001";

const principal = {
  tenantId: TENANT_ID,
  userId: "019ffacf-684d-7531-9624-117246bbcf58",
  permissions: new Set<string>(),
  isPlatformAdmin: false,
} as never;

/** Chainable stand-in for a Drizzle select: resolves to the personnel row or no rows. */
function fakeTx() {
  const personnelRow = {
    id: RECORD_ID,
    tenantId: TENANT_ID,
    departmentId: null,
    sourcePayload: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  const select = vi.fn(() => {
    let table: unknown;
    const builder: Record<string, unknown> = {};
    for (const method of ["where", "orderBy", "limit", "leftJoin", "innerJoin"]) {
      builder[method] = () => builder;
    }
    builder.from = (t: unknown) => {
      table = t;
      return builder;
    };
    builder.then = (resolve: (rows: unknown[]) => unknown) =>
      resolve(table === industrialPersonnel ? [personnelRow] : []);
    return builder;
  });
  return { select, execute: vi.fn(async () => ({ rows: [] })) };
}

describe("IndustrialDomainService.getPersonnel", () => {
  it("loads training records for the resolved record id when opened by employee number", async () => {
    const tx = fakeTx();
    const transaction = vi.fn(async (cb: (inner: unknown) => unknown) => cb(tx));
    const svc = new IndustrialDomainService({ transaction } as never);
    const internals = svc as unknown as Record<string, (...args: unknown[]) => unknown>;
    vi.spyOn(internals, "resolvePersonnelRecordId").mockResolvedValue(RECORD_ID);
    vi.spyOn(internals, "linkMatchingRecordsByEmployeeNumber").mockResolvedValue(undefined);
    vi.spyOn(internals, "resolvePersonnelDepartmentName").mockResolvedValue(null);
    vi.spyOn(internals, "resolveLicenseDownloadUrls").mockImplementation(
      async (projection: unknown) => projection,
    );
    vi.spyOn(internals, "resolvePersonnelCertCopy").mockResolvedValue(null);
    eqCalls.length = 0;

    await svc.getPersonnel(principal, EMPLOYEE_NUMBER);

    const trainingPersonnelIds = eqCalls
      .filter(([column]) => column === industrialTrainingRecords.personnelId)
      .map(([, value]) => value);
    expect(trainingPersonnelIds).toEqual([RECORD_ID]);
    // The raw route id must never reach a uuid column.
    expect(eqCalls.some(([, value]) => value === EMPLOYEE_NUMBER)).toBe(false);
  });
});
