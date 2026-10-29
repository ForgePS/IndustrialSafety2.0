import type { ReactNode } from "react";
import { EmptyState } from "../primitives.js";

/**
 * Permission gate for UI convenience. Backend authorization remains authoritative.
 * Prefer wiring `allowed` from `useAuth().hasPermission` / `usePermission`.
 */
export function Can({
  allowed,
  children,
  fallback = null,
}: {
  allowed: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

export function PermissionDenied({
  title = "You do not have permission to view this page",
  description = "Contact a platform administrator if you believe this is an error.",
}: {
  title?: string;
  description?: string;
}) {
  return <EmptyState title={title} description={description} />;
}
