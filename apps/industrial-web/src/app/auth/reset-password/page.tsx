"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CognitoOAuthError, confirmCognitoPasswordReset } from "@forge/web-kit";

const PASSWORD_HINT =
  "At least 12 characters, with uppercase, lowercase, a number, and a symbol.";

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
      setError(err instanceof CognitoOAuthError || err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="card-body">
        <h1 className="h4 mb-2">Password updated</h1>
        <p className="mb-4">Sign in with your email and the new password.</p>
        <Link href="/" className="btn btn-primary">
          Continue to sign in
        </Link>
      </section>
    );
  }

  return (
    <form className="card-body" onSubmit={(event) => void onSubmit(event)}>
      <h1 className="h4 mb-2">Set a new password</h1>
      <p className="mb-4">
        Enter the verification code from your password-reset email. If you need a new code, use{" "}
        <Link href="/auth/forgot-password/">Forgot password?</Link> on the sign-in page first.
      </p>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      <div className="mb-3">
        <label className="form-label" htmlFor="reset-email">
          Email
        </label>
        <input
          id="reset-email"
          className="form-control"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="reset-code">
          Verification code
        </label>
        <input
          id="reset-code"
          className="form-control"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="reset-password">
          New password
        </label>
        <input
          id="reset-password"
          className="form-control"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="form-text">{PASSWORD_HINT}</div>
      </div>
      <div className="mb-4">
        <label className="form-label" htmlFor="reset-confirm">
          Confirm password
        </label>
        <input
          id="reset-confirm"
          className="form-control"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="btn btn-primary d-grid w-100" disabled={!canSubmit}>
        {busy ? "Saving…" : "Update password"}
      </button>
      <p className="text-center mt-3 mb-0">
        <Link href="/">Back to sign in</Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="container-xxl">
      <div className="authentication-wrapper authentication-basic container-p-y">
        <div className="authentication-inner">
          <div className="card">
            <Suspense
              fallback={
                <div className="card-body">
                  <p className="text-muted mb-0">Loading…</p>
                </div>
              }
            >
              <ResetPasswordInner />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
