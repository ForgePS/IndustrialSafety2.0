import { describe, expect, it, vi } from "vitest";
import { ForgeError } from "@forge/errors";
import { IndustrialDomainService } from "./industrial-domain.service.js";

/**
 * The flat controller exposes catch-all `:module/:id` routes, so any unknown
 * sub-path (e.g. GET /industrial/training/records) arrives as an id. Record ids
 * are uuid columns, so a non-uuid id previously reached Postgres and failed as
 * an unhandled 500, which rendered the SPA error boundary. These must read as
 * NOT_FOUND without touching the database.
 */
describe("IndustrialDomainService record id validation", () => {
  function service() {
    const db = { transaction: vi.fn() } as never;
    return { svc: new IndustrialDomainService(db), db };
  }

  const principal = {
    tenantId: "019ff7d0-c20f-7659-81e4-c0cd68e23262",
    userId: "019ffacf-684d-7531-9624-117246bbcf58",
    permissions: new Set<string>(),
    isPlatformAdmin: false,
  } as never;

  const nonUuidPaths = ["records", "progress", "sources", "summary", ""];

  it.each(nonUuidPaths)("returns NOT_FOUND for training/%s without querying", async (segment) => {
    const { svc, db } = service();
    await expect(svc.getModule(principal, "training", segment)).rejects.toBeInstanceOf(ForgeError);
    await expect(svc.getModule(principal, "training", segment)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a non-uuid personnel id", async () => {
    const { svc, db } = service();
    await expect(svc.getPersonnel(principal, "orientation")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("still rejects unknown modules before id parsing", async () => {
    const { svc } = service();
    await expect(
      svc.getModule(principal, "not-a-module", "019ff7d0-c20f-7659-81e4-c0cd68e23262"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
