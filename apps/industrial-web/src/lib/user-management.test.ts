import { describe, expect, it } from "vitest";
import {
  canAccessUserManagement,
  canInviteUsers,
  canManageUserManagement,
  canSendPasswordReset,
  directoryUsersCsv,
  filterDirectoryUsers,
  paginateDirectoryUsers,
  preferredInviteRole,
  toDirectoryUsers,
  userDisplayName,
  userManagementStats,
} from "./user-management";

describe("canAccessUserManagement", () => {
  it("allows Super Admin, Creator, and Tenant Admin", () => {
    expect(canAccessUserManagement({ isPlatformAdmin: true, permissions: [] })).toBe(true);
    expect(
      canAccessUserManagement({
        isPlatformAdmin: false,
        permissions: [],
        activeProducts: ["FORGE_CREATOR"],
      }),
    ).toBe(true);
    expect(
      canAccessUserManagement({
        isPlatformAdmin: false,
        permissions: ["platform.membership.manage"],
      }),
    ).toBe(true);
  });

  it("hides the section from managers and unsigned-in users", () => {
    expect(canAccessUserManagement(null)).toBe(false);
    expect(
      canAccessUserManagement({
        isPlatformAdmin: false,
        permissions: ["platform.membership.read", "platform.user.invite"],
      }),
    ).toBe(false);
    expect(
      canAccessUserManagement({
        isPlatformAdmin: false,
        permissions: ["industrial.access", "industrial.personnel.view"],
      }),
    ).toBe(false);
  });

  it("allows industrial tenant admins who hold several module manage grants", () => {
    expect(
      canAccessUserManagement({
        isPlatformAdmin: false,
        permissions: [
          "industrial.personnel.manage",
          "industrial.incidents.manage",
          "industrial.inspections.manage",
          "industrial.fleet.manage",
        ],
      }),
    ).toBe(true);
  });
});

describe("canManageUserManagement / canInviteUsers", () => {
  it("lets platform admins mutate and invite", () => {
    const me = { isPlatformAdmin: true, permissions: [] };
    expect(canManageUserManagement(me)).toBe(true);
    expect(canInviteUsers(me)).toBe(true);
  });

  it("requires invitation permissions to add users", () => {
    expect(
      canInviteUsers({ isPlatformAdmin: false, permissions: ["platform.membership.manage"] }),
    ).toBe(false);
    expect(
      canInviteUsers({ isPlatformAdmin: false, permissions: ["platform.invitation.manage"] }),
    ).toBe(true);
  });

  it("lets membership managers send password resets even without invite", () => {
    expect(
      canSendPasswordReset({ isPlatformAdmin: false, permissions: ["platform.membership.manage"] }),
    ).toBe(true);
    expect(
      canSendPasswordReset({ isPlatformAdmin: false, permissions: ["industrial.personnel.view"] }),
    ).toBe(false);
  });
});

describe("toDirectoryUsers", () => {
  it("maps memberships onto the directory, merging optional user rows", () => {
    const users = toDirectoryUsers(
      [
        {
          id: "m1",
          userId: "u1",
          status: "ACTIVE",
          userStatus: "ACTIVE",
          email: "ada@producers.test",
          firstName: "Ada",
          lastName: "Rice",
          roles: [{ roleCode: "INDUSTRIAL_TENANT_ADMIN", roleName: "Tenant Admin" }],
          recordVersion: 3,
        },
        {
          id: "m2",
          userId: "u2",
          status: "PENDING",
          email: "guest@producers.test",
        },
      ],
      [{ id: "u2", username: "guest.user", status: "INVITED" }],
    );

    expect(users).toHaveLength(2);
    expect(users[0]?.displayName).toBe("Ada Rice");
    expect(users[0]?.verified).toBe(true);
    expect(users[0]?.roles[0]?.roleCode).toBe("INDUSTRIAL_TENANT_ADMIN");
    expect(users[1]?.displayName).toBe("guest.user");
    expect(users[1]?.pending).toBe(true);
    expect(users[1]?.username).toBe("guest.user");
  });

  it("falls back to the email local part when no name is stored", () => {
    expect(userDisplayName({ email: "john.doe@mill.test" })).toBe("john doe");
  });
});

describe("stats, search, pagination, export", () => {
  const users = toDirectoryUsers([
    {
      id: "m1",
      userId: "u1",
      status: "ACTIVE",
      userStatus: "ACTIVE",
      email: "one@test.com",
      displayName: "Test Name",
    },
    {
      id: "m2",
      userId: "u2",
      status: "PENDING",
      userStatus: "INVITED",
      email: "two@test.com",
      displayName: "John Doe",
    },
    {
      id: "m3",
      userId: "u3",
      status: "ACTIVE",
      userStatus: "ACTIVE",
      email: "one@test.com",
      displayName: "Duplicate",
    },
  ]);

  it("counts verified, pending, and duplicate emails", () => {
    expect(userManagementStats(users)).toEqual({
      total: 3,
      verified: 2,
      duplicates: 1,
      pending: 1,
    });
  });

  it("filters by name or email", () => {
    expect(filterDirectoryUsers(users, "john").map((row) => row.displayName)).toEqual(["John Doe"]);
  });

  it("pages the filtered list", () => {
    const page = paginateDirectoryUsers(users, 2, 2);
    expect(page.pageCount).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.from).toBe(3);
    expect(page.to).toBe(3);
  });

  it("exports a CSV with a header row", () => {
    const csv = directoryUsersCsv(users);
    expect(csv.split("\n")[0]).toContain("Email");
    expect(csv).toContain("Test Name");
  });
});

describe("preferredInviteRole", () => {
  it("prefers industrial tenant admin when present", () => {
    expect(
      preferredInviteRole([
        { code: "INDUSTRIAL_EMPLOYEE", name: "Employee" },
        { code: "INDUSTRIAL_TENANT_ADMIN", name: "Tenant Admin" },
      ]),
    ).toBe("INDUSTRIAL_TENANT_ADMIN");
  });
});
