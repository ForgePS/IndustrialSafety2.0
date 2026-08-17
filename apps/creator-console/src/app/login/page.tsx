"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  InvalidAccessTokenError,
  parseDevPrincipal,
  setBearerToken,
  setDevPrincipal,
  useAuth,
} from "@forge/web-kit";

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
      if (err instanceof InvalidAccessTokenError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
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
    <div className="authentication-wrapper authentication-basic container-p-y">
      <div className="authentication-inner">
        <div className="card">
          <div className="card-body">
            <div className="app-brand justify-content-center mb-4">
              <span className="app-brand-text demo text-body fw-bolder">Forge Creator Console</span>
            </div>
            <h4 className="mb-2">Welcome to Forge</h4>
            <p className="mb-4">
              Sign in with your Forge account. Deployed environments use Cognito Hosted UI (email and
              password on Cognito).
            </p>

            {authError ? (
              <div className="alert alert-danger" role="alert">
                {authError}
              </div>
            ) : null}
            {error ? (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            ) : null}
            {!loading && me ? (
              <div className="alert alert-success" role="alert">
                Authenticated as <code>{me.userId}</code>.{" "}
                <Link href="/select-tenant/">Select tenant</Link> or <Link href="/">go to dashboard</Link>.
              </div>
            ) : null}

            <div className="mb-4">
              <h5 className="mb-2">Sign in</h5>
              <p className="text-muted mb-3">
                You will be redirected to Cognito to enter your email and password. The console stores
                only the Cognito <code>access_token</code> JWT — never JWKS public keys.
              </p>
              <button
                className="btn btn-primary d-grid w-100"
                type="button"
                disabled={submitting}
                onClick={() => void onCognitoLogin()}
              >
                {submitting ? "Redirecting…" : "Sign In"}
              </button>
            </div>

            {allowDevPrincipal ? (
              <div className="mb-4 pt-3 border-top">
                <h5 className="mb-2">Dev principal (local / emulator only)</h5>
                <p className="text-muted mb-3">
                  Sends <code>x-forge-dev-principal</code>. Unavailable in deployed Creator Console
                  builds.
                </p>
                {parsedEnv ? (
                  <p className="text-muted mb-3">
                    Build default: user <code>{parsedEnv.userId}</code>, tenant{" "}
                    <code>{parsedEnv.tenantId}</code>
                  </p>
                ) : null}
                <form onSubmit={onDevLogin}>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="userId">
                      User ID
                    </label>
                    <input
                      id="userId"
                      className="form-control"
                      required
                      value={userId}
                      onChange={(event) => setUserId(event.target.value)}
                      placeholder="UUID"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="tenantId">
                      Tenant ID
                    </label>
                    <input
                      id="tenantId"
                      className="form-control"
                      required
                      value={tenantId}
                      onChange={(event) => setTenantId(event.target.value)}
                      placeholder="UUID"
                    />
                  </div>
                  <button className="btn btn-outline-secondary" type="submit" disabled={submitting}>
                    {submitting ? "Signing in…" : "Sign in with dev principal"}
                  </button>
                </form>
              </div>
            ) : null}

            {allowDevPrincipal ? (
              <div className="pt-3 border-top">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setShowAdvanced((open) => !open)}
                >
                  {showAdvanced ? "Hide advanced" : "Advanced (paste access token)"}
                </button>
                {showAdvanced ? (
                  <form className="mt-3" onSubmit={onTokenLogin}>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="bearerToken">
                        Access token (JWT only)
                      </label>
                      <textarea
                        id="bearerToken"
                        className="form-control"
                        rows={3}
                        value={bearerToken}
                        onChange={(event) => setBearerTokenValue(event.target.value)}
                        placeholder="eyJhbGciOi…"
                      />
                    </div>
                    <button className="btn btn-outline-secondary" type="submit" disabled={submitting}>
                      Sign in with bearer token
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
