"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CognitoPasswordChallengeError,
  useAuth,
  type CognitoPasswordChallenge,
} from "@forge/web-kit";

type Step = "credentials" | "new_password" | "mfa";

export function CreatorPasswordLoginForm() {
  const router = useRouter();
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

  function applyChallenge(err: unknown): boolean {
    if (!(err instanceof CognitoPasswordChallengeError)) return false;
    setChallenge(err.challenge);
    setStep(err.challenge.kind === "new_password_required" ? "new_password" : "mfa");
    setError(null);
    return true;
  }

  async function afterAuth() {
    router.push("/select-tenant/");
  }

  async function onCredentials(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginWithPassword(email, password);
      await afterAuth();
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
      await afterAuth();
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
      await afterAuth();
    } catch (err) {
      if (!applyChallenge(err)) {
        setError(err instanceof Error ? err.message : "MFA verification failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <h5 className="mb-2">Sign in</h5>
      <p className="text-muted mb-3">
        Enter your Forge email and password. You stay on this page — no Cognito Hosted UI redirect.
      </p>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {step === "credentials" ? (
        <form onSubmit={(event) => void onCredentials(event)}>
          <div className="mb-3">
            <label className="form-label" htmlFor="creator-login-email">
              Email
            </label>
            <input
              id="creator-login-email"
              className="form-control"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="creator-login-password">
              Password
            </label>
            <input
              id="creator-login-password"
              className="form-control"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary d-grid w-100" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : null}

      {step === "new_password" ? (
        <form onSubmit={(event) => void onNewPassword(event)}>
          <p className="mb-3">Choose a new password to finish signing in.</p>
          <div className="mb-3">
            <label className="form-label" htmlFor="creator-login-new-password">
              New password
            </label>
            <input
              id="creator-login-new-password"
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
            <label className="form-label" htmlFor="creator-login-confirm-password">
              Confirm password
            </label>
            <input
              id="creator-login-confirm-password"
              className="form-control"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(ev) => setConfirmPassword(ev.target.value)}
              required
              minLength={12}
            />
          </div>
          <button className="btn btn-primary d-grid w-100" type="submit" disabled={busy}>
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
            <label className="form-label" htmlFor="creator-login-mfa">
              Authentication code
            </label>
            <input
              id="creator-login-mfa"
              className="form-control"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(ev) => setMfaCode(ev.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary d-grid w-100" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Verify and sign in"}
          </button>
        </form>
      ) : null}

      <p className="text-center text-muted small mt-3 mb-0">
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
