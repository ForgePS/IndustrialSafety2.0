"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authMe, exchangeCodeForTokens, useAuth, validateOAuthState } from "@forge/web-kit";
import { FieldLogo } from "@/components/field-logo";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
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
      <div className="ff-gate-message">
        <FieldLogo size="compact" />
        <h1 className="ff-page-title">Sign-in failed</h1>
        <p className="ff-error">{error}</p>
        <a href="/" className="ff-link">
          Return to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="ff-gate-message">
      <FieldLogo size="compact" />
      <h1 className="ff-page-title">Signing in…</h1>
      <p className="ff-page-body">Exchanging authorization code…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="ff-gate-message">
          <FieldLogo size="compact" />
          <p className="ff-page-body">Loading…</p>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
