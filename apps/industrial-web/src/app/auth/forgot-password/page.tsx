"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ApiError, apiSend } from "@forge/web-kit";

function buildResetUrl(email: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/auth/reset-password/?email=${encodeURIComponent(email.trim())}`;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const resetUrl = useMemo(() => (email.trim() ? buildResetUrl(email) : ""), [email]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/v1/auth/forgot-password", "POST", { email: normalized });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-xxl">
      <div className="authentication-wrapper authentication-basic container-p-y">
        <div className="authentication-inner">
          <div className="card">
            {sent ? (
              <div className="card-body">
                <h1 className="h4 mb-2">Check your email</h1>
                <p className="mb-3">
                  If an account exists for <strong>{email.trim()}</strong>, we sent a password reset
                  message with a verification code and link.
                </p>
                {resetUrl ? (
                  <p className="mb-4">
                    Open{" "}
                    <Link href={resetUrl} className="fw-medium">
                      the reset page
                    </Link>{" "}
                    and enter the code from that email.
                  </p>
                ) : null}
                <Link href="/" className="btn btn-primary">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <form className="card-body" onSubmit={(event) => void onSubmit(event)}>
                <h1 className="h4 mb-2">Forgot password?</h1>
                <p className="mb-4">
                  Enter the email on your account. We will email a verification code and a link to set
                  a new password.
                </p>
                {error ? (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                ) : null}
                <div className="mb-4">
                  <label className="form-label" htmlFor="forgot-email">
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    className="form-control"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary d-grid w-100" disabled={busy}>
                  {busy ? "Sending…" : "Send reset email"}
                </button>
                <p className="text-center mt-3 mb-0">
                  <Link href="/auth/reset-password/">Already have a code?</Link>
                  {" · "}
                  <Link href="/">Back to sign in</Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
