"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import {
  CognitoPasswordChallengeError,
  consumeIdleSignOutNotice,
  useAuth,
  type CognitoPasswordChallenge,
} from "@forge/web-kit";

type Step = "credentials" | "new_password" | "mfa";

export function CognitoPasswordLoginForm({
  primaryColor,
  submitLabel = "Sign in",
}: {
  primaryColor?: string;
  submitLabel?: string;
}) {
  const { loginWithPassword, completeNewPassword, completeMfa, loginWithCognito } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [step, setStep] = useState<Step>("credentials");
  const [challenge, setChallenge] = useState<CognitoPasswordChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idleNotice, setIdleNotice] = useState(false);

  useEffect(() => {
    setIdleNotice(consumeIdleSignOutNotice());
  }, []);

  const buttonStyle: CSSProperties | undefined = primaryColor
    ? { backgroundColor: primaryColor, borderColor: primaryColor }
    : undefined;

  function applyChallenge(err: unknown): boolean {
    if (!(err instanceof CognitoPasswordChallengeError)) return false;
    setChallenge(err.challenge);
    setStep(err.challenge.kind === "new_password_required" ? "new_password" : "mfa");
    setError(null);
    return true;
  }

  async function onCredentials(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginWithPassword(email, password);
    } catch (err) {
      if (!applyChallenge(err)) {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onNewPassword(event: FormEvent) {
    event.preventDefault();
    if (!challenge || challenge.kind !== "new_password_required") return;
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeNewPassword(challenge, newPassword);
    } catch (err) {
      if (!applyChallenge(err)) {
        setError(err instanceof Error ? err.message : "Could not set new password");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onMfa(event: FormEvent) {
    event.preventDefault();
    if (!challenge || challenge.kind !== "mfa_required") return;
    setBusy(true);
    setError(null);
    try {
      await completeMfa(challenge, mfaCode);
    } catch (err) {
      if (!applyChallenge(err)) {
        setError(err instanceof Error ? err.message : "MFA verification failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {idleNotice && !error ? (
        <div className="alert alert-info" role="status">
          You were signed out after 1 hour of inactivity. Sign in again to continue.
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {step === "credentials" ? (
        <form onSubmit={(event) => void onCredentials(event)}>
          <div className="mb-3">
            <label className="form-label" htmlFor="ind-login-email">
              Email
            </label>
            <input
              id="ind-login-email"
              className="form-control"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="ind-login-password">
              Password
            </label>
            <input
              id="ind-login-password"
              className="form-control"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary d-grid w-100"
            style={buttonStyle}
            disabled={busy}
          >
            {busy ? "Signing in…" : submitLabel}
          </button>
        </form>
      ) : null}

      {step === "new_password" ? (
        <form onSubmit={(event) => void onNewPassword(event)}>
          <p className="mb-3">Choose a new password to finish signing in.</p>
          <div className="mb-3">
            <label className="form-label" htmlFor="ind-login-new-password">
              New password
            </label>
            <input
              id="ind-login-new-password"
              className="form-control"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(ev) => setNewPassword(ev.target.value)}
              required
              minLength={12}
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="ind-login-confirm-password">
              Confirm password
            </label>
            <input
              id="ind-login-confirm-password"
              className="form-control"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(ev) => setConfirmPassword(ev.target.value)}
              required
              minLength={12}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary d-grid w-100"
            style={buttonStyle}
            disabled={busy}
          >
            {busy ? "Saving…" : "Set password and sign in"}
          </button>
        </form>
      ) : null}

      {step === "mfa" ? (
        <form onSubmit={(event) => void onMfa(event)}>
          <p className="mb-3">
            {challenge?.kind === "mfa_required" && challenge.delivery === "sms"
              ? "Enter the code sent to your phone."
              : "Enter the code from your authenticator app."}
          </p>
          <div className="mb-3">
            <label className="form-label" htmlFor="ind-login-mfa">
              Authentication code
            </label>
            <input
              id="ind-login-mfa"
              className="form-control"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(ev) => setMfaCode(ev.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary d-grid w-100"
            style={buttonStyle}
            disabled={busy}
          >
            {busy ? "Verifying…" : "Verify and sign in"}
          </button>
        </form>
      ) : null}

      <p className="text-center mt-3 mb-0">
        <Link href="/auth/forgot-password/">Forgot password?</Link>
        {" · "}
        <Link href="/auth/reset-password/">Have a reset code?</Link>
      </p>
      <p className="text-center text-muted small mt-2 mb-0">
        <button
          type="button"
          className="btn btn-link btn-sm p-0 align-baseline"
          onClick={() => void loginWithCognito()}
        >
          Use Cognito Hosted UI
        </button>
      </p>
    </div>
  );
}
