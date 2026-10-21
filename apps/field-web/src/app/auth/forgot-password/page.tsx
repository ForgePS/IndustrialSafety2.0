"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ApiError, apiSend } from "@forge/web-kit";
import { FieldLogo } from "@/components/field-logo";

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
    <div className="ff-login">
      <div className="ff-brand-stack ff-brand-stack--login">
        <FieldLogo size="compact" />
      </div>
      <div className="ff-login-card">
        {sent ? (
          <>
            <h1 className="ff-page-title">Check your email</h1>
            <p className="ff-page-body">
              If an account exists for <strong>{email.trim()}</strong>, we sent a verification code
              and reset instructions for the <strong>development</strong> environment.
            </p>
            {resetUrl ? (
              <p className="ff-page-body">
                <Link href={resetUrl} className="ff-link">
                  Open the reset page
                </Link>{" "}
                and enter the code from that email.
              </p>
            ) : null}
            <Link href="/" className="ff-btn">
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={(event) => void onSubmit(event)}>
            <h1 className="ff-page-title">Forgot password?</h1>
            <p className="ff-page-body">
              Reset your <strong>development</strong> Forge password. Production passwords are
              separate and will not work on this Field site.
            </p>
            {error ? (
              <p className="ff-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="ff-field">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                className="ff-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
              />
            </div>
            <button type="submit" className="ff-btn" disabled={busy}>
              {busy ? "Sending…" : "Send reset email"}
            </button>
            <p className="ff-hint">
              <Link href="/auth/reset-password/" className="ff-link">
                Already have a code?
              </Link>
              {" · "}
              <Link href="/" className="ff-link">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
