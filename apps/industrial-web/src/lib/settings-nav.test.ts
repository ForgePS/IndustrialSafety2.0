import { describe, expect, it } from "vitest";
import {
  buildSettingsNavGroups,
  settingsNavActive,
  type SettingsNavVisibility,
} from "./settings-nav";

describe("buildSettingsNavGroups", () => {
  const allOn: SettingsNavVisibility = {
    canUsers: true,
    canDropdowns: true,
    canTrainingPortal: true,
    canModules: true,
    canCompliance: true,
    canAudit: true,
    canConfiguration: true,
  };

  it("groups visible items and drops empty groups", () => {
    const groups = buildSettingsNavGroups(allOn);
    expect(groups.map((g) => g.id)).toEqual([
      "home",
      "organization",
      "users-access",
      "modules",
      "forms-fields",
      "qr",
      "compliance-audit",
      "account",
    ]);
    const org = groups.find((g) => g.id === "organization");
    expect(org?.items.some((i) => i.href === "/settings/branding/")).toBe(true);
    expect(org?.items.some((i) => i.href === "/settings/presentation/")).toBe(true);
    expect(org?.items.some((i) => i.soon && i.href === "/settings/locations/")).toBe(true);
  });

  it("shows presentation when canPresentation is true even without configuration", () => {
    const groups = buildSettingsNavGroups({
      ...allOn,
      canConfiguration: false,
      canPresentation: true,
    });
    const org = groups.find((g) => g.id === "organization");
    expect(org?.items.map((i) => i.href)).toEqual(["/settings/presentation/"]);
  });

  it("hides organization when configuration is denied", () => {
    const groups = buildSettingsNavGroups({ ...allOn, canConfiguration: false });
    expect(groups.some((g) => g.id === "organization")).toBe(false);
  });

  it("keeps overview and profile for everyone", () => {
    const groups = buildSettingsNavGroups({
      canUsers: false,
      canDropdowns: false,
      canTrainingPortal: false,
      canModules: false,
      canCompliance: false,
      canAudit: false,
      canConfiguration: false,
    });
    expect(groups.map((g) => g.id)).toEqual(["home", "account"]);
  });
});

describe("settingsNavActive", () => {
  it("matches overview exactly", () => {
    expect(settingsNavActive("/settings/", "/settings/")).toBe(true);
    expect(settingsNavActive("/settings/users/", "/settings/")).toBe(false);
  });

  it("matches nested routes by prefix", () => {
    expect(settingsNavActive("/settings/branding/", "/settings/branding/")).toBe(true);
  });
});
