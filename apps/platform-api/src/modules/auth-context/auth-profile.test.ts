import { describe, expect, it } from "vitest";
import {
  buildAuthProfileDisplayName,
  canEditAuthProfile,
  dateOnly,
} from "./auth-profile.js";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function principal(overrides?: {
  userId?: string;
  isPlatformAdmin?: boolean;
  permissions?: string[];
  products?: string[];
}) {
  return {
    userId: overrides?.userId ?? USER,
    isPlatformAdmin: overrides?.isPlatformAdmin ?? false,
    permissions: new Set(overrides?.permissions ?? []),
    activeProducts: new Set(overrides?.products ?? []),
  };
}

describe("canEditAuthProfile", () => {
  it("allows the signed-in user to edit their own profile", () => {
    expect(canEditAuthProfile(principal(), USER)).toBe(true);
    expect(
      canEditAuthProfile(principal({ permissions: ["industrial.access"] }), USER),
    ).toBe(true);
  });

  it("allows Super Admin, Creator, and Tenant Admin to edit another user", () => {
    expect(canEditAuthProfile(principal({ isPlatformAdmin: true }), OTHER)).toBe(true);
    expect(canEditAuthProfile(principal({ products: ["FORGE_CREATOR"] }), OTHER)).toBe(true);
    expect(
      canEditAuthProfile(principal({ permissions: ["industrial.admin"] }), OTHER),
    ).toBe(true);
    expect(
      canEditAuthProfile(principal({ permissions: ["platform.membership.manage"] }), OTHER),
    ).toBe(true);
  });

  it("blocks operators from editing someone else", () => {
    expect(
      canEditAuthProfile(principal({ permissions: ["industrial.access", "industrial.personnel.view"] }), OTHER),
    ).toBe(false);
  });
});

describe("buildAuthProfileDisplayName", () => {
  it("prefers preferred name, otherwise joins name parts", () => {
    expect(
      buildAuthProfileDisplayName({
        firstName: "Ada",
        lastName: "Lovelace",
        preferredName: "Ada",
      }),
    ).toBe("Ada");
    expect(
      buildAuthProfileDisplayName({
        firstName: "Ada",
        middleName: "Byron",
        lastName: "Lovelace",
        suffix: "Jr",
      }),
    ).toBe("Ada Byron Lovelace Jr");
  });
});

describe("dateOnly", () => {
  it("normalizes dates to YYYY-MM-DD", () => {
    expect(dateOnly("1990-05-01T00:00:00.000Z")).toBe("1990-05-01");
    expect(dateOnly(null)).toBe(null);
  });
});
