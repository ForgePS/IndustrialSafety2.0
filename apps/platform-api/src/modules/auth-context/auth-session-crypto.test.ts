import { describe, expect, it, vi, afterEach } from "vitest";
import {
  decryptRefreshToken,
  encryptRefreshToken,
  redactAuthSessionSecrets,
  resetAuthSessionCryptoWarningForTests,
  resolveAuthSessionEncryptionKey,
} from "./auth-session-crypto.js";

describe("auth-session-crypto", () => {
  afterEach(() => {
    resetAuthSessionCryptoWarningForTests();
    delete process.env.FORGE_AUTH_SESSION_ENCRYPTION_KEY;
  });

  it("round-trips refresh token encryption", () => {
    const key = resolveAuthSessionEncryptionKey(
      "local",
      Buffer.alloc(32, 7).toString("base64"),
    );
    const encrypted = encryptRefreshToken("cognito-refresh-secret", key);
    expect(encrypted.ciphertextBase64).not.toContain("cognito-refresh-secret");
    expect(decryptRefreshToken(encrypted, key)).toBe("cognito-refresh-secret");
  });

  it("uses insecure deterministic key in local when env missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const a = resolveAuthSessionEncryptionKey("local", "");
    const b = resolveAuthSessionEncryptionKey("local", "");
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejects missing key outside local/testing", () => {
    expect(() => resolveAuthSessionEncryptionKey("production", "")).toThrow(
      /FORGE_AUTH_SESSION_ENCRYPTION_KEY/,
    );
  });

  it("redacts refresh-related fields", () => {
    const redacted = redactAuthSessionSecrets({
      refreshToken: "secret",
      accessToken: "ok",
      refresh_token_ciphertext: "blob",
    });
    expect(redacted.refreshToken).toBe("[redacted]");
    expect(redacted.refresh_token_ciphertext).toBe("[redacted]");
    expect(redacted.accessToken).toBe("ok");
  });
});
