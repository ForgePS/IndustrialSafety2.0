import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingIndicator } from "../primitives.js";

export type ForgeShellAreaState =
  "loading" | "empty" | "error" | "unauthorized" | "disabled_entitlement" | "ready";

/**
 * Standard shell-area presentation for MK-S8 required states.
 * Use inside chrome slots or content panels when data/auth/entitlement gating applies.
 */
export function ForgeShellState({
  state,
  title,
  description,
  children,
  action,
}: {
  state: ForgeShellAreaState;
  title?: string;
  description?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  if (state === "ready") {
    return <>{children}</>;
  }
  if (state === "loading") {
    return (
      <div className="forge-shell-state" role="status" aria-live="polite">
        <LoadingIndicator label={title ?? "Loading…"} />
        {description ? <p className="forge-topbar__meta">{description}</p> : null}
      </div>
    );
  }
  if (state === "empty") {
    return (
      <EmptyState
        title={title ?? "Nothing here yet"}
        description={description ?? "No items to display."}
        {...(action ? { action } : {})}
      />
    );
  }
  if (state === "error") {
    return (
      <ErrorState
        title={title ?? "Something went wrong"}
        description={description ?? "Try again or contact support."}
      />
    );
  }
  if (state === "unauthorized") {
    return (
      <ErrorState
        title={title ?? "Unauthorized"}
        description={description ?? "You do not have permission for this area."}
      />
    );
  }
  return (
    <EmptyState
      title={title ?? "Not entitled"}
      description={description ?? "This product or module is not enabled for the active tenant."}
      {...(action ? { action } : {})}
    />
  );
}
