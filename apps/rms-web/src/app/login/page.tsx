"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { parseDevPrincipal, setBearerToken, setDevPrincipal, useAuth } from "@forge/web-kit";
import styles from "../page.module.css";

const allowDevPrincipal = process.env.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL === "true";

export default function LoginPage() {
  const router = useRouter();
  const { refresh, me, loading, error: authError, loginWithCognito } = useAuth();
  const [userId, setUserId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [bearerToken, setBearerTokenValue] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onDevLogin(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setDevPrincipal({ userId: userId.trim(), tenantId: tenantId.trim() });
      await refresh();
      router.push("/select-tenant/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onTokenLogin(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setBearerToken(bearerToken.trim());
      await refresh();
      router.push("/select-tenant/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCognitoLogin() {
    setSubmitting(true);
    setError(null);
    try {
      await loginWithCognito();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Redirect to Cognito failed");
      setSubmitting(false);
    }
  }

  const envPrincipal = allowDevPrincipal ? process.env.NEXT_PUBLIC_DEV_PRINCIPAL : undefined;
  const parsedEnv = envPrincipal ? parseDevPrincipal(envPrincipal) : null;

  return (
    <section className={styles.page}>
      <h1>Sign in</h1>
      <p className={styles.lead}>
        Sign in with your Forge account. Deployed environments use Cognito Hosted UI.
      </p>

      {authError ? <p className={styles.error}>{authError}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {!loading && me ? (
        <div className={styles.success}>
          Authenticated as <span className={styles.mono}>{me.userId}</span>.{" "}
          <Link href="/select-tenant/">Select tenant</Link> or <Link href="/">go home</Link>.
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Forge account</h2>
        <p className={styles.muted}>You will be redirected to the Cognito Hosted UI to sign in.</p>
        <button
          className={styles.button}
          type="button"
          disabled={submitting}
          onClick={() => void onCognitoLogin()}
        >
          {submitting ? "Redirecting…" : "Sign in with Cognito"}
        </button>
      </div>

      {allowDevPrincipal ? (
        <div className={styles.panel}>
          <h2>Dev principal (local only)</h2>
          {parsedEnv ? (
            <p className={styles.muted}>
              Build default: user <span className={styles.mono}>{parsedEnv.userId}</span>, tenant{" "}
              <span className={styles.mono}>{parsedEnv.tenantId}</span>
            </p>
          ) : null}
          <form className={styles.form} onSubmit={onDevLogin}>
            <div className={styles.formRow}>
              <label htmlFor="userId">User ID</label>
              <input
                id="userId"
                required
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="tenantId">Tenant ID</label>
              <input
                id="tenantId"
                required
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              />
            </div>
            <button className={styles.buttonSecondary} type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in with dev principal"}
            </button>
          </form>
        </div>
      ) : null}

      {allowDevPrincipal ? (
        <div className={styles.panel}>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={() => setShowAdvanced((open) => !open)}
          >
            {showAdvanced ? "Hide advanced" : "Advanced (paste token)"}
          </button>
          {showAdvanced ? (
            <form className={styles.form} onSubmit={onTokenLogin}>
              <div className={styles.formRow}>
                <label htmlFor="bearerToken">Access token</label>
                <textarea
                  id="bearerToken"
                  rows={3}
                  value={bearerToken}
                  onChange={(e) => setBearerTokenValue(e.target.value)}
                />
              </div>
              <button className={styles.buttonSecondary} type="submit" disabled={submitting}>
                Sign in with bearer token
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
