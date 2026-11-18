"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CognitoOAuthError, confirmCognitoPasswordReset } from "@forge/web-kit";
import { FieldLogo } from "@/components/field-logo";

const PASSWORD_HINT = "At least 12 characters, with uppercase, lowercase, a number, and a symbol.";

function passwordMeetsPolicy(password: string): boolean {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email")?.trim() ?? "";
  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (emailFromQuery && email === "") setEmail(emailFromQuery);
  }, [emailFromQuery, email]);

  const canSubmit = useMemo(() => {
    return (
      email.trim() !== "" &&
      code.trim() !== "" &&
      passwordMeetsPolicy(password) &&
      password === confirm &&
      !busy
    );
  }, [email, code, password, confirm, busy]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await confirmCognitoPasswordReset({
        username: email.trim(),
        code: code.trim(),
        newPassword: password,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof CognitoOAuthError || err instanceof Error ? err.message : "Reset failed",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <h1 className="ff-page-title">Password updated</h1>
        <p className="ff-page-body">Sign in with your email and the new development password.</p>
        <Link href="/" className="ff-btn">
          Continue to sign in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <h1 className="ff-page-title">Set a new password</h1>
      <p className="ff-page-body">
        Enter the verification code from your reset email. Need a new code? Use{" "}
        <Link href="/auth/forgot-password/" className="ff-link">
          Forgot password
        </Link>
        .
      </p>
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="ff-field">
        <label htmlFor="reset-email">Email</label>
        <input
          id="reset-email"
          className="ff-input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="ff-field">
        <label htmlFor="reset-code">Verification code</label>
        <input
          id="reset-code"
          className="ff-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
      </div>
      <div className="ff-field">
        <label htmlFor="reset-password">New password</label>
        <input
          id="reset-password"
          className="ff-input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="ff-hint">{PASSWORD_HINT}</p>
      </div>
      <div className="ff-field">
        <label htmlFor="reset-confirm">Confirm password</label>
        <input
          id="reset-confirm"
          className="ff-input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="ff-btn" disabled={!canSubmit}>
        {busy ? "Saving…" : "Update password"}
      </button>
      <p className="ff-hint">
        <Link href="/" className="ff-link">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="ff-login">
      <div className="ff-brand-stack ff-brand-stack--login">
        <FieldLogo size="compact" />
      </div>
      <div className="ff-login-card">
        <Suspense fallback={<p className="ff-page-body">Loading…</p>}>
          <ResetPasswordInner />
        </Suspense>
      </div>
    </div>
  );
}
