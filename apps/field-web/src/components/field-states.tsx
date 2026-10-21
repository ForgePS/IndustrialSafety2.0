"use client";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="ff-state ff-state--loading" role="status" aria-live="polite">
      <p className="ff-page-body">{label}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="ff-state ff-state--error" role="alert">
      <h2 className="ff-page-title">{title}</h2>
      {message ? <p className="ff-page-body">{message}</p> : null}
      {onRetry ? (
        <button type="button" className="ff-btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <div className="ff-state ff-state--empty">
      <h2 className="ff-page-title">{title}</h2>
      {message ? <p className="ff-page-body">{message}</p> : null}
    </div>
  );
}
