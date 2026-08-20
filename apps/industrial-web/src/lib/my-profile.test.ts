import { describe, expect, it } from "vitest";
import { canEditMyProfile, profileInitials, profileWelcomeName } from "./my-profile";

describe("canEditMyProfile", () => {
  it("allows the signed-in user to edit their own profile", () => {
    expect(canEditMyProfile({ userId: "u1", permissions: ["industrial.access"] })).toBe(true);
    expect(
      canEditMyProfile({ userId: "u1", permissions: ["industrial.access"] }, "u1"),
    ).toBe(true);
  });

  it("allows Super Admin, Creator, and Tenant Admin to edit another user", () => {
    expect(canEditMyProfile({ userId: "admin", isPlatformAdmin: true }, "u2")).toBe(true);
    expect(
      canEditMyProfile({ userId: "c1", activeProducts: ["FORGE_CREATOR"] }, "u2"),
    ).toBe(true);
    expect(
      canEditMyProfile({ userId: "a1", permissions: ["industrial.admin"] }, "u2"),
    ).toBe(true);
  });

  it("blocks operators from editing someone else", () => {
    expect(
      canEditMyProfile(
        { userId: "u1", permissions: ["industrial.access", "industrial.personnel.view"] },
        "u2",
      ),
    ).toBe(false);
    expect(canEditMyProfile(null)).toBe(false);
  });
});

describe("profileInitials / profileWelcomeName", () => {
  it("uses name parts when present", () => {
    expect(profileInitials({ firstName: "Ada", lastName: "Lovelace" })).toBe("AL");
    expect(profileWelcomeName({ preferredName: "Ada Lovelace", firstName: "Ada" })).toBe("Ada");
    expect(profileWelcomeName({ firstName: "Grace" })).toBe("Grace");
    expect(profileWelcomeName({})).toBeNull();
  });
});
