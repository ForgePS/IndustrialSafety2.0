import { describe, expect, it, vi } from "vitest";
import { redactCredentialError } from "./safe-admin.js";

describe("redactCredentialError", () => {
  it("strips password values and connection strings from error text", () => {
    const err = new Error(
      "Failed query: ALTER ROLE forge_app WITH LOGIN PASSWORD 'super-secret-value' postgresql://forge_app:super-secret-value@host/db",
    );
    const safe = redactCredentialError(err);
    expect(safe.message).not.toContain("super-secret-value");
    expect(safe.message).not.toMatch(/postgresql:\/\//i);
    expect(safe.message).toMatch(/REDACTED|safe_admin_operation_failed/i);
  });

  it("includes postgres error code when present without query text", () => {
    const err = Object.assign(new Error("ALTER ROLE ... PASSWORD 'abc'"), { code: "42501" });
    const safe = redactCredentialError(err);
    expect(safe.message).toContain("code=42501");
    expect(safe.message).not.toContain("abc");
    expect(safe.message).not.toContain("ALTER ROLE");
  });
});

describe("alterRolePassword", () => {
  it("does not expose the supplied password when the driver rejects the statement", async () => {
    vi.resetModules();
    vi.doMock("postgres", () => {
      const fn = Object.assign(() => {
        const client = Object.assign(
          async () => {
            throw Object.assign(new Error("ALTER ROLE x PASSWORD 'should-not-leak'"), {
              code: "42501",
            });
          },
          {
            unsafe: async (_sql: string, params: unknown[]) => {
              const fake = Object.assign(
                new Error(
                  `Failed query: ALTER ROLE forge_app WITH PASSWORD '${String(params[0])}'`,
                ),
                {
                  code: "42501",
                  query: `ALTER ROLE forge_app WITH PASSWORD '${String(params[0])}'`,
                },
              );
              throw fake;
            },
            end: async () => undefined,
          },
        );
        return client;
      }, {});
      return { default: fn };
    });

    const { alterRolePassword: alter } = await import("./safe-admin.js");
    const secret = "this-must-never-appear-in-error-output";
    await expect(
      alter({
        adminConnectionString: "postgresql://admin:admin@localhost:5432/db",
        roleName: "forge_app",
        newPassword: secret,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const serialized = JSON.stringify(
        error instanceof Error ? { message: error.message, stack: error.stack } : error,
      );
      return !message.includes(secret) && !serialized.includes(secret);
    });
  });
});
