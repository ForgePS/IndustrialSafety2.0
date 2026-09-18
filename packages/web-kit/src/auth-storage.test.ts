// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAuthStorage,
  clearCachedAuthMe,
  getBearerToken,
  getCachedAuthMe,
  getRefreshToken,
  purgeLegacyAuthKeys,
  setBearerToken,
  setCachedAuthMe,
  setRefreshToken,
} from "./auth-storage.js";

const SAMPLE_JWT =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidG9rZW5fdXNlIjoiYWNjZXNzIn0.signature";

describe("auth-storage FIS-H01", () => {
  beforeEach(() => {
    clearAuthStorage();
    localStorage.setItem("forge-bearer-token", "legacy");
    localStorage.setItem("forge-refresh-token", "legacy-refresh");
    localStorage.setItem("forge-active-tenant-id", "legacy-tenant");
    purgeLegacyAuthKeys();
  });

  afterEach(() => {
    clearAuthStorage();
  });

  it("keeps bearer in memory and never persists refresh", () => {
    setBearerToken(SAMPLE_JWT);
    expect(getBearerToken()).toBe(SAMPLE_JWT);
    expect(localStorage.getItem("forge-bearer-token")).toBeNull();

    setRefreshToken("should-not-persist");
    expect(getRefreshToken()).toBeNull();
    expect(localStorage.getItem("forge-refresh-token")).toBeNull();
  });

  it("purgeLegacyAuthKeys only removes credential keys", () => {
    localStorage.setItem("forge-bearer-token", "legacy");
    localStorage.setItem("forge-refresh-token", "legacy-refresh");
    localStorage.setItem("forge-active-tenant-id", "legacy-tenant");
    localStorage.setItem("forge-dev-principal", '{"userId":"u","tenantId":"t"}');
    purgeLegacyAuthKeys();
    expect(localStorage.getItem("forge-bearer-token")).toBeNull();
    expect(localStorage.getItem("forge-refresh-token")).toBeNull();
    expect(localStorage.getItem("forge-active-tenant-id")).toBeNull();
    expect(localStorage.getItem("forge-dev-principal")).toBeTruthy();
  });

  it("clearAuthStorage purges legacy keys, memory bearer, and auth-me cache", () => {
    setBearerToken(SAMPLE_JWT);
    setCachedAuthMe({
      userId: "u1",
      tenantId: "tenant-a",
      permissions: ["industrial.access"],
      tenants: [],
    });
    localStorage.setItem("forge-bearer-token", "legacy");
    localStorage.setItem("forge-refresh-token", "legacy-refresh");
    localStorage.setItem("forge-active-tenant-id", "legacy-tenant");
    expect(getCachedAuthMe()).toBeTruthy();

    clearAuthStorage();

    expect(getBearerToken()).toBeNull();
    expect(getCachedAuthMe()).toBeNull();
    expect(sessionStorage.getItem("forge-auth-me-cache")).toBeNull();
    expect(localStorage.getItem("forge-bearer-token")).toBeNull();
    expect(localStorage.getItem("forge-refresh-token")).toBeNull();
    expect(localStorage.getItem("forge-active-tenant-id")).toBeNull();
  });
});

describe("clearCachedAuthMe", () => {
  afterEach(() => {
    clearAuthStorage();
  });

  it("removes prior tenant auth-me cache entries", () => {
    setBearerToken(SAMPLE_JWT);
    setCachedAuthMe({
      userId: "u1",
      tenantId: "tenant-a",
      permissions: ["industrial.admin"],
      tenants: [],
    });
    expect(getCachedAuthMe()).toMatchObject({ tenantId: "tenant-a" });
    clearCachedAuthMe();
    expect(getCachedAuthMe()).toBeNull();
  });
});
