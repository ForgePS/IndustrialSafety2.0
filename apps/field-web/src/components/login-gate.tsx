"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  CognitoPasswordChallengeError,
  useAuth,
  type CognitoPasswordChallenge,
} from "@forge/web-kit";
import { FieldLogo } from "@/components/field-logo";
import { FieldThemeSettings, useFieldThemeMode } from "@/components/field-theme-settings";
import { useFieldLoginBranding } from "@/hooks/use-field-login-branding";
import { fieldTenantLogoFor } from "@/lib/field-tenant-logo";

type Step = "credentials" | "new_password" | "mfa";

/** Inline env check so Field does not depend on a freshly rebuilt @forge/web-kit dist. */
function hasCognitoPublicEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_COGNITO_DOMAIN &&
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID &&
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  );
}

/**
 * FIELD-S0 login gate.
 * Sign-in is Cognito email/password or SSO until employee-number + PIN auth ships.
 */
export function LoginGate({ authError }: { authError?: string | null }) {
  const { loginWithPassword, completeNewPassword, completeMfa, loginWithCognito } = useAuth();
  const { branding } = useFieldLoginBranding();
  const { resolved } = useFieldThemeMode();
  const cognitoReady = hasCognitoPublicEnv();
  const tenantLogo = fieldTenantLogoFor({
    displayName: branding.tenantDisplayName || branding.brandLabel,
    theme: resolved,
    brandingLogoUrl: branding.logoUrl,
  });
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challenge, setChallenge] = useState<CognitoPasswordChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayError = error ?? authError ?? null;

  function applyChallenge(err: unknown): boolean {
    const nextChallenge =
      err instanceof CognitoPasswordChallengeError
        ? err.challenge
        : err &&
            typeof err === "object" &&
            "name" in err &&
            err.name === "CognitoPasswordChallengeError" &&
            "challenge" in err
          ? (err as CognitoPasswordChallengeError).challenge
          : null;
    if (!nextChallenge) return false;
    setChallenge(nextChallenge);
    setStep(nextChallenge.kind === "new_password_required" ? "new_password" : "mfa");
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
    <div className="ff-login">
      <div className="ff-brand-stack ff-brand-stack--login">
        <FieldLogo size="login" />
        {tenantLogo ? (
          <img className="ff-tenant-logo" src={tenantLogo.src} alt={tenantLogo.label} />
        ) : null}
      </div>

      <div className="ff-login-card">
        {!cognitoReady ? (
          <p className="ff-error" role="alert">
            Cognito is not configured. Copy <code>apps/field-web/.env.local.example</code> to{" "}
            <code>.env.local</code> and restart the Field app.
          </p>
        ) : null}
        {displayError ? (
          <p className="ff-error" role="alert">
            {displayError}
          </p>
        ) : null}

        {step === "credentials" ? (
          <form onSubmit={onCredentials}>
            <div className="ff-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="ff-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="ff-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="ff-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="ff-btn" disabled={busy || !cognitoReady}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="ff-hint">
              <Link href="/auth/forgot-password/" className="ff-link">
                Forgot password?
              </Link>
            </p>
            {cognitoReady ? (
              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                disabled={busy}
                onClick={() => void loginWithCognito()}
              >
                Sign in with SSO
              </button>
            ) : null}
            <p className="ff-hint">
              {process.env.NEXT_PUBLIC_APP_ENV === "production" ? (
                <>
                  Use your <strong>production</strong> Forge Industrial account (same as{" "}
                  <a href="https://d1n0e5wvjwbpdf.cloudfront.net/" className="ff-link">
                    industrial
                  </a>
                  ).
                </>
              ) : (
                <>
                  Use your <strong>development</strong> Forge Industrial account (same as{" "}
                  <a href="https://industrial-dev.forgepublicsafety.com/" className="ff-link">
                    industrial-dev
                  </a>
                  ). Production credentials will not work here.
                </>
              )}
            </p>
            {displayError?.includes("Incorrect email or password") ? (
              <p className="ff-hint">
                If your company uses single sign-on, try <strong>Sign in with SSO</strong> instead
                of email and password.
              </p>
            ) : null}
          </form>
        ) : null}

        {step === "new_password" ? (
          <form onSubmit={onNewPassword}>
            <div className="ff-field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                className="ff-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="ff-field">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                className="ff-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="ff-btn" disabled={busy}>
              Set password
            </button>
          </form>
        ) : null}

        {step === "mfa" ? (
          <form onSubmit={onMfa}>
            <div className="ff-field">
              <label htmlFor="mfa">Verification code</label>
              <input
                id="mfa"
                className="ff-input"
                inputMode="numeric"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="ff-btn" disabled={busy}>
              Verify
            </button>
          </form>
        ) : null}
      </div>

      <FieldThemeSettings />
    </div>
  );
}
