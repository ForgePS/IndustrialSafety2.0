"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { friendlyAuthMessage, isAuthSetupMessage } from "@/lib/auth-messages";

export function SignInPanel({
  title = "Sign in required",
  description = "Sign in with your Forge account to continue.",
  error,
  actions,
}: {
  title?: string;
  description?: string;
  error?: string | null;
  actions: ReactNode;
}) {
  const setup = isAuthSetupMessage(error);

  return (
    <div className="card creator-sign-in-panel">
      <div className="card-body">
        <h5 className="mb-2">{setup ? "Local development" : title}</h5>
        <p className="text-muted mb-0">
          {setup
            ? friendlyAuthMessage(error ?? "")
            : description}
        </p>
        {setup ? (
          <p className="text-muted mb-0 mt-2">
            You can also open login options to use a dev principal when Cognito is not configured.
          </p>
        ) : null}
        <div className="d-flex flex-wrap gap-2 mt-3">
          {actions}
          {setup ? (
            <Link className="btn btn-outline-secondary" href="/login/">
              Open login options
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
