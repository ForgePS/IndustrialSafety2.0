"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const detail =
    typeof error?.message === "string" && error.message.trim() ? error.message.trim() : null;
  const name = typeof error?.name === "string" && error.name.trim() ? error.name.trim() : null;

  useEffect(() => {
    // Surface the real exception for support / local debugging.
    console.error("[industrial-web error boundary]", error);
  }, [error]);

  return (
    <section className="ind-state" role="alert">
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred in Forge Industrial Safety.</p>
      {name ? <p className="ind-muted">Type: {name}</p> : null}
      {detail ? <p className="ind-muted">{detail}</p> : null}
      <p className="ind-muted">Correlation: {error.digest ?? "local"}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
