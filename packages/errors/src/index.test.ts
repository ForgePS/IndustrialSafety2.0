import { describe, expect, it } from "vitest";
import { ForgeError, isForgeError } from "./index.js";

describe("ForgeError", () => {
  it("maps TENANT_SUSPENDED to 403", () => {
    const err = new ForgeError("TENANT_SUSPENDED", "Tenant suspended");
    expect(err.statusCode).toBe(403);
    expect(isForgeError(err)).toBe(true);
  });

  it("duck-types ForgeError across package copies", () => {
    const foreign = Object.assign(new Error("No active access to the requested tenant"), {
      name: "ForgeError",
      code: "FORBIDDEN",
      statusCode: 403,
      details: [],
      exposeMessage: true,
    });
    expect(isForgeError(foreign)).toBe(true);
    expect(isForgeError(new Error("nope"))).toBe(false);
    expect(isForgeError(null)).toBe(false);
  });
});
