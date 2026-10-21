"use client";



import Link from "next/link";

import { useRouter } from "next/navigation";

import { useMemo, useState, type FormEvent } from "react";

import {

  InvalidAccessTokenError,

  parseDevPrincipal,

  setBearerToken,

  setDevPrincipal,

  useAuth,

} from "@forge/web-kit";

import { AuthSetupNotice } from "@/components/auth-setup-notice";

import { CreatorPasswordLoginForm } from "@/components/creator-password-login-form";

import { friendlyAuthMessage, isAuthSetupMessage, isCognitoConfigured } from "@/lib/auth-messages";

import { SneatThemeToggle } from "@forge/sneat";



const allowDevPrincipal = process.env.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL === "true";

const cognitoConfigured = isCognitoConfigured();



export default function LoginPage() {

  const router = useRouter();

  const { refresh, me, loading, error: authError } = useAuth();

  const [userId, setUserId] = useState("");

  const [tenantId, setTenantId] = useState("");

  const [bearerToken, setBearerTokenValue] = useState("");

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);



  const setupMessage = useMemo(() => {

    const message = error ?? authError;

    return isAuthSetupMessage(message) ? friendlyAuthMessage(message ?? "") : null;

  }, [authError, error]);



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



  const envPrincipal = allowDevPrincipal ? process.env.NEXT_PUBLIC_DEV_PRINCIPAL : undefined;

  const parsedEnv = envPrincipal ? parseDevPrincipal(envPrincipal) : null;



  return (

    <div className="authentication-wrapper authentication-basic container-p-y">

      <div className="creator-auth-theme-toggle">
        <SneatThemeToggle />
      </div>

      <div className="authentication-inner">

        <div className="card">

          <div className="card-body">

            <div className="app-brand justify-content-center mb-4">
              <img
                className="app-brand-auth-logo"
                src="/branding/forge-industrial-safety.png"
                alt="Forge Industrial Safety"
              />
            </div>
            <h4 className="mb-2 text-center">Welcome to Forge</h4>
            <p className="mb-4 text-muted text-center">
              Sign in with your Forge account. Deployed environments use Cognito Hosted UI.
            </p>



            {setupMessage ? (

              <AuthSetupNotice message={setupMessage} />

            ) : (

              <>

                {authError ? <AuthSetupNotice message={authError} /> : null}

                {error ? <AuthSetupNotice message={error} /> : null}

              </>

            )}



            {!loading && me ? (

              <div className="alert alert-success" role="alert">

                Authenticated as <span className="creator-inline-code">{me.userId}</span>.{" "}

                <Link href="/select-tenant/">Select tenant</Link> or <Link href="/">go to dashboard</Link>.

              </div>

            ) : null}



            {cognitoConfigured ? (
              <CreatorPasswordLoginForm />
            ) : (
              <div className="mb-4">
                <AuthSetupNotice message="Add Cognito settings to .env.local before using password sign-in." />
              </div>
            )}

            <p className="text-center text-muted small mt-4 mb-0">
              Forge Industrial Safety, a division of Forge Public Safety
            </p>



            {allowDevPrincipal ? (

              <div className="mb-4 pt-3 border-top">

                <h5 className="mb-2">Dev principal (local / emulator only)</h5>

                <p className="text-muted mb-3">

                  Sends the dev principal header. Unavailable in deployed Creator Console builds.

                </p>

                {parsedEnv ? (

                  <p className="text-muted mb-3">

                    Build default: user <span className="creator-inline-code">{parsedEnv.userId}</span>,

                    tenant <span className="creator-inline-code">{parsedEnv.tenantId}</span>

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

            ) : !cognitoConfigured ? (

              <p className="text-muted mb-0 pt-3 border-top">

                Enable <span className="creator-inline-code">NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL=true</span>{" "}

                for local dev sign-in without Cognito, or add Cognito env vars for hosted UI.

              </p>

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

            <p className="text-center text-muted small mt-4 mb-0">
              Forge Industrial Safety, a division of Forge Public Safety
            </p>

          </div>

        </div>

      </div>

    </div>

  );

}


