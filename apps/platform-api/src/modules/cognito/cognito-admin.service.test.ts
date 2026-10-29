import { describe, expect, it } from "vitest";
import { ForgeError } from "@forge/errors";
import { passwordResetMethodForStatus } from "./cognito-admin.service.js";

describe("passwordResetMethodForStatus", () => {
  it("resends invitations for users who have not finished first sign-in", () => {
    expect(passwordResetMethodForStatus("FORCE_CHANGE_PASSWORD")).toBe("resend");
    expect(passwordResetMethodForStatus("UNCONFIRMED")).toBe("resend");
  });

  it("sends a reset email for confirmed accounts", () => {
    expect(passwordResetMethodForStatus("CONFIRMED")).toBe("reset");
    expect(passwordResetMethodForStatus("RESET_REQUIRED")).toBe("reset");
  });

  it("rejects disabled and unknown Cognito states", () => {
    expect(() => passwordResetMethodForStatus("CONFIRMED", false)).toThrow(ForgeError);
    expect(() => passwordResetMethodForStatus("ARCHIVED")).toThrow(ForgeError);
    expect(() => passwordResetMethodForStatus(undefined)).toThrow(ForgeError);
  });
});
