import { describe, expect, it, vi } from "vitest";
import { ForgeError } from "@forge/errors";
import { AuthPasswordController } from "./auth-password.controller.js";

describe("AuthPasswordController.forgotPassword", () => {
  const cognito = { resetPassword: vi.fn() };
  const controller = new AuthPasswordController(cognito as never);
  const req = { requestId: "req-1", correlationId: "corr-1" } as never;

  it("returns success without leaking missing accounts", async () => {
    cognito.resetPassword.mockRejectedValue(new ForgeError("NOT_FOUND", "missing"));
    const result = await controller.forgotPassword({ email: "nobody@example.com" }, req);
    expect(result.data.sent).toBe(true);
  });

  it("calls cognito for a valid email", async () => {
    cognito.resetPassword.mockResolvedValue({ method: "reset" });
    await controller.forgotPassword({ email: "Operator@Example.com" }, req);
    expect(cognito.resetPassword).toHaveBeenCalledWith("operator@example.com");
  });

  it("surfaces rate limits", async () => {
    cognito.resetPassword.mockRejectedValue(
      new ForgeError("RATE_LIMITED", "Too many password reset attempts."),
    );
    await expect(controller.forgotPassword({ email: "a@b.com" }, req)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});
