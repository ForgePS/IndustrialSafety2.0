"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authMe, exchangeCodeForTokens, useAuth, validateOAuthState } from "@forge/web-kit";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Guard against React remount / searchParams identity churn double-running
    // OAuth exchange (would clear PKCE/OAuth state on the first pass).
    if (started.current) return;
    started.current = true;

    async function completeSignIn() {
      const oauthError = searchParams.get("error");
      const oauthDescription = searchParams.get("error_description");
      if (oauthError) {
        setError(oauthDescription ?? oauthError);
        return;
      }

      const code = searchParams.get("code");
      const state = searchParams.get("state");
      if (!code) {
        setError("Missing authorization code from Cognito");
        return;
      }
      if (!validateOAuthState(state)) {
        setError("Invalid OAuth state — restart sign-in from the home page");
        return;
      }

      try {
        await exchangeCodeForTokens(code);
        // Call authMe directly — useAuth().refresh() swallows 401 and would
        // silently send users back to the Sign in screen.
        await authMe();
        await refresh();
        router.replace("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    }

    void completeSignIn();
  }, [refresh, router, searchParams]);

  if (error) {
    return (
      <section className="ind-state" role="alert">
        <h1>Sign-in failed</h1>
        <p className="ind-error">{error}</p>
        <p className="ind-muted">
          <a href="/">Return home</a>
        </p>
      </section>
    );
  }

  return (
    <section className="ind-state" role="status" aria-live="polite">
      <h1>Completing sign-in</h1>
      <p className="ind-muted">Exchanging authorization code…</p>
    </section>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <section className="ind-state" role="status">
          <p className="ind-muted">Loading…</p>
        </section>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
