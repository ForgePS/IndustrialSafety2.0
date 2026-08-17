import { describe, expect, it, vi } from "vitest";
import { IndustrialDomainService } from "./industrial-domain.service.js";

type Mapper = {
  unwrapSourcePayload(raw: unknown): Record<string, unknown>;
  normalizePersonnelPayload(payload: Record<string, unknown>): Record<string, unknown>;
  preferFilled(
    columns: Record<string, unknown>,
    payload: Record<string, unknown>,
  ): Record<string, unknown>;
  splitDisplayName(displayName: string): {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    suffix?: string;
  };
  mapListItem(row: {
    id: string;
    displayName?: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    sourcePayload?: unknown;
    extra?: Record<string, unknown>;
  }): Record<string, unknown>;
};

function mapper(): Mapper {
  const db = { transaction: vi.fn() } as never;
  return new IndustrialDomainService(db) as unknown as Mapper;
}

describe("personnel source_payload connection", () => {
  it("unwraps a JSON string stored inside jsonb", () => {
    const raw = JSON.stringify({
      employeeNumber: "EMP-25080",
      jobTitle: "GRINDER OPER. I CO-PRODUCTS GV",
      hireDate: "2025-10-01",
      suffix: "III",
      displayName: "ALBERT J. ROBY III",
    });
    expect(mapper().unwrapSourcePayload(raw)).toMatchObject({
      jobTitle: "GRINDER OPER. I CO-PRODUCTS GV",
      hireDate: "2025-10-01",
    });
  });

  it("unwraps a double-encoded string", () => {
    const inner = JSON.stringify({ jobTitle: "QUALITY TECH" });
    expect(mapper().unwrapSourcePayload(JSON.stringify(inner))).toMatchObject({
      jobTitle: "QUALITY TECH",
    });
  });

  it("returns {} for blank or invalid payloads", () => {
    expect(mapper().unwrapSourcePayload(null)).toEqual({});
    expect(mapper().unwrapSourcePayload("")).toEqual({});
    expect(mapper().unwrapSourcePayload("not-json")).toEqual({});
  });

  it("does not let empty columns wipe payload values", () => {
    const merged = mapper().preferFilled(
      { firstName: "", lastName: "", jobTitle: null, employeeNumber: "EMP-1" },
      { firstName: "Ada", jobTitle: "Millwright", employeeNumber: "OLD" },
    );
    expect(merged).toMatchObject({
      firstName: "Ada",
      jobTitle: "Millwright",
      employeeNumber: "EMP-1",
    });
    expect(merged).not.toHaveProperty("lastName");
  });

  it("maps goesBy and splits displayName into identity fields", () => {
    const normalized = mapper().normalizePersonnelPayload({
      displayName: "ALBERT J. ROBY III",
      goesBy: "Al",
      jobTitle: "GRINDER OPER. I CO-PRODUCTS GV",
    });
    expect(normalized).toMatchObject({
      preferredName: "Al",
      firstName: "ALBERT",
      middleName: "J.",
      lastName: "ROBY",
      suffix: "III",
      jobTitle: "GRINDER OPER. I CO-PRODUCTS GV",
    });
  });

  it("surfaces job title on the personnel file shape used by the UI", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const item = mapper().mapListItem({
      id: "202bd5c3-e81f-b2d4-9cb2-ae78b13013d2",
      displayName: "ALBERT J. ROBY III",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      sourcePayload: mapper().normalizePersonnelPayload(
        mapper().unwrapSourcePayload(
          JSON.stringify({
            employeeNumber: "EMP-25080",
            jobTitle: "GRINDER OPER. I CO-PRODUCTS GV",
            hireDate: "2025-10-01",
            suffix: "III",
            displayName: "ALBERT J. ROBY III",
          }),
        ),
      ),
      extra: {
        firstName: "",
        lastName: "",
        email: "",
        employeeNumber: "EMP-25080",
        jobTitle: null,
        hireDate: null,
        suffix: null,
      },
    });

    expect(item).toMatchObject({
      displayName: "ALBERT J. ROBY III",
      employeeNumber: "EMP-25080",
      jobTitle: "GRINDER OPER. I CO-PRODUCTS GV",
      hireDate: "2025-10-01",
      firstName: "ALBERT",
      lastName: "ROBY",
      suffix: "III",
    });
  });
});
