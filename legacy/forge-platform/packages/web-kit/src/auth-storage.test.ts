// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAuthStorage,
  clearCachedAuthMe,
  clearCsrfToken,
  getActiveTenantId,
  getBearerToken,
  getCachedAuthMe,
  getCsrfToken,
  getRefreshToken,
  purgeLegacyAuthKeys,
  setActiveTenantId,
  setBearerToken,
  setCachedAuthMe,
  setCsrfToken,
  setRefreshToken,
  clearActiveTenantId,
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

  it("persists CSRF in sessionStorage and localStorage (PWA cold-start)", () => {
    setCsrfToken("csrf-abc");
    expect(getCsrfToken()).toBe("csrf-abc");
    expect(sessionStorage.getItem("forge-csrf-token")).toBe("csrf-abc");
    expect(localStorage.getItem("forge-csrf-token")).toBe("csrf-abc");

    // Simulate module remount + sessionStorage wipe (common on Field PWA reopen).
    clearCsrfToken();
    localStorage.setItem("forge-csrf-token", "csrf-from-local");
    expect(getCsrfToken()).toBe("csrf-from-local");
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

  it("clearAuthStorage purges legacy keys, memory bearer, CSRF, and auth-me cache", () => {
    setBearerToken(SAMPLE_JWT);
    setCsrfToken("csrf-to-clear");
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
    expect(getCsrfToken()).toBeNull();
    expect(getCachedAuthMe()).toBeNull();
    expect(sessionStorage.getItem("forge-auth-me-cache")).toBeNull();
    expect(sessionStorage.getItem("forge-active-tenant-id")).toBeNull();
    expect(sessionStorage.getItem("forge-csrf-token")).toBeNull();
    expect(localStorage.getItem("forge-csrf-token")).toBeNull();
    expect(localStorage.getItem("forge-bearer-token")).toBeNull();
    expect(localStorage.getItem("forge-refresh-token")).toBeNull();
    expect(localStorage.getItem("forge-active-tenant-id")).toBeNull();
  });

  it("persists active tenant in sessionStorage only (not localStorage)", () => {
    setActiveTenantId("tenant-producers");
    expect(getActiveTenantId()).toBe("tenant-producers");
    expect(sessionStorage.getItem("forge-active-tenant-id")).toBe("tenant-producers");
    expect(localStorage.getItem("forge-active-tenant-id")).toBeNull();
    clearActiveTenantId();
    expect(getActiveTenantId()).toBeNull();
    expect(sessionStorage.getItem("forge-active-tenant-id")).toBeNull();
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
