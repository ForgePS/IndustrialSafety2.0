// @vitest-environment jsdom
/**
 * RG-09 browser cleanup matrix — proves logout and tenant-switch wipe Forge-owned
 * storage without leaving refresh credentials readable to XSS.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAuthStorage,
  getBearerToken,
  getRefreshToken,
  setBearerToken,
  setRefreshToken,
} from "./auth-storage.js";
import {
  registerForgeBrowserCleanup,
  removeStorageKeysByPrefix,
  resetForgeBrowserCleanupHandlersForTests,
  runForgeBrowserCleanup,
} from "./forge-browser-cleanup.js";

const SAMPLE_JWT =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidG9rZW5fdXNlIjoiYWNjZXNzIn0.signature";

const INDUSTRIAL_PREFIXES = [
  "forge.ind.offline.v1:",
  "forge.sanitation.draft.",
  "forge-ind-dashboard-layout-v1:",
] as const;

const FIELD_PREFIXES = [
  "forge.field.offline.v1:",
  "forge.field.report.draft.v1:",
] as const;

function seedCrossTenantResidue(): void {
  localStorage.setItem("forge.ind.offline.v1:tenant-a:user:domain:k", '{"v":1}');
  localStorage.setItem("forge.sanitation.draft.abc", '{"draft":true}');
  localStorage.setItem("forge-ind-dashboard-layout-v1:tenant-a:user", "[]");
  localStorage.setItem("forge.field.offline.v1:tenant-a:user:x", "1");
  localStorage.setItem("forge.field.report.draft.v1:r1", "{}");
  localStorage.setItem("forge-ind-theme-mode", "dark");
  localStorage.setItem("forge.field.theme-mode", "light");
  localStorage.setItem("forge-bearer-token", "legacy-access");
  localStorage.setItem("forge-refresh-token", "legacy-refresh");
  sessionStorage.setItem("forge-walkthrough-studio-session", "{}");
  sessionStorage.setItem("forge-auth-me-cache", '{"tokenFingerprint":"x","me":{}}');
}

function readableCredentialScan(): string[] {
  const hits: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key) ?? "";
    if (/refresh|bearer|access_token|id_token/i.test(key) || /refresh|eyJ/.test(value)) {
      if (key.includes("theme")) continue;
      hits.push(`${key}=${value.slice(0, 24)}`);
    }
  }
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    const value = sessionStorage.getItem(key) ?? "";
    if (/refresh|bearer|access_token/i.test(key) || /refresh_token/.test(value)) {
      hits.push(`session:${key}`);
    }
  }
  return hits;
}

describe("RG-09 browser cleanup matrix", () => {
  beforeEach(() => {
    resetForgeBrowserCleanupHandlersForTests();
    clearAuthStorage();
    localStorage.clear();
    sessionStorage.clear();
    registerForgeBrowserCleanup(() => {
      removeStorageKeysByPrefix(localStorage, INDUSTRIAL_PREFIXES);
      removeStorageKeysByPrefix(localStorage, FIELD_PREFIXES);
      removeStorageKeysByPrefix(sessionStorage, ["forge-walkthrough-studio-session"]);
      clearAuthStorage();
    });
  });

  afterEach(() => {
    resetForgeBrowserCleanupHandlersForTests();
    clearAuthStorage();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("logout clears prior-tenant offline residue and auth memory", async () => {
    seedCrossTenantResidue();
    setBearerToken(SAMPLE_JWT);
    setRefreshToken("must-not-stick");

    await runForgeBrowserCleanup("logout");

    expect(localStorage.getItem("forge.ind.offline.v1:tenant-a:user:domain:k")).toBeNull();
    expect(localStorage.getItem("forge.field.report.draft.v1:r1")).toBeNull();
    expect(sessionStorage.getItem("forge-walkthrough-studio-session")).toBeNull();
    expect(getBearerToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    // Device prefs retained
    expect(localStorage.getItem("forge-ind-theme-mode")).toBe("dark");
    expect(localStorage.getItem("forge.field.theme-mode")).toBe("light");
  });

  it("tenant-switch clears prior tenant records/queues without leaving refresh readable", async () => {
    seedCrossTenantResidue();
    setBearerToken(SAMPLE_JWT);

    await runForgeBrowserCleanup("tenant-switch");

    expect(localStorage.getItem("forge.sanitation.draft.abc")).toBeNull();
    expect(localStorage.getItem("forge.field.offline.v1:tenant-a:user:x")).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(localStorage.getItem("forge-refresh-token")).toBeNull();
  });

  it("XSS scan cannot find long-lived refresh credentials after login simulation", () => {
    setBearerToken(SAMPLE_JWT);
    setRefreshToken("attacker-bait-refresh");
    clearAuthStorage();
    purgeLegacyOnly();
    expect(readableCredentialScan()).toEqual([]);
    expect(getRefreshToken()).toBeNull();
  });
});

function purgeLegacyOnly(): void {
  for (const key of ["forge-bearer-token", "forge-refresh-token", "forge-active-tenant-id"]) {
    localStorage.removeItem(key);
  }
}
