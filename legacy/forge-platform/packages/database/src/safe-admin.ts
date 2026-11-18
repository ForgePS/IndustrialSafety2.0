import postgres from "postgres";

const SENSITIVE_PATTERN =
  /(password|passwd|secretstring|secret|token|credential|postgresql:\/\/[^\s"']+)/gi;

/**
 * Strip credential-bearing substrings from error text before logging or rethrowing.
 * Never include raw SQL or connection strings in the returned message.
 */
export function redactCredentialError(error: unknown): Error {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = raw.replace(SENSITIVE_PATTERN, "[REDACTED]");
  const safe = new Error(
    code
      ? `safe_admin_operation_failed code=${code}`
      : `safe_admin_operation_failed: ${redacted.slice(0, 160)}`,
  );
  safe.name = "SafeAdminError";
  return safe;
}

export interface AlterRolePasswordInput {
  /** Admin (or other role capable of ALTER ROLE) connection string. */
  adminConnectionString: string;
  roleName: string;
  newPassword: string;
}

/**
 * Change a LOGIN role password using a parameterized driver call.
 * On failure, throws a redacted error that must not include SQL or the password.
 */
export async function alterRolePassword(input: AlterRolePasswordInput): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(input.roleName)) {
    throw new Error("invalid_role_name");
  }
  if (!input.newPassword || input.newPassword.length < 16) {
    throw new Error("password_too_short");
  }

  const client = postgres(input.adminConnectionString, {
    max: 1,
    // Prevent driver debug paths from echoing parameters in this process.
    debug: false,
  });

  try {
    // Identifier interpolated only after regex allowlist; password is a bound parameter.
    // Do not include NOSUPERUSER/attribute clauses here — Aurora master is not a full superuser.
    await client.unsafe(`ALTER ROLE ${input.roleName} PASSWORD $1`, [input.newPassword]);
  } catch (error) {
    throw redactCredentialError(error);
  } finally {
    await client.end({ timeout: 5 });
  }
}

export interface EnsureAppRoleInput {
  adminConnectionString: string;
  roleName?: string;
}

/** Create forge_app (or named) LOGIN role without elevated attributes if missing. */
export async function ensureAppLoginRole(input: EnsureAppRoleInput): Promise<void> {
  const roleName = input.roleName ?? "forge_app";
  if (!/^[a-z_][a-z0-9_]*$/i.test(roleName)) {
    throw new Error("invalid_role_name");
  }
  const client = postgres(input.adminConnectionString, { max: 1, debug: false });
  try {
    await client.unsafe(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
    CREATE ROLE ${roleName} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;
`);
  } catch (error) {
    throw redactCredentialError(error);
  } finally {
    await client.end({ timeout: 5 });
  }
}
