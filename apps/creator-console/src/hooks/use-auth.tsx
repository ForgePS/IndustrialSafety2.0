/**
 * Re-export web-kit auth hooks so existing Creator Console imports keep working.
 * AuthProvider lives in AppShell (web-kit); login uses in-app password auth.
 */
export { useAuth, usePermission, type AuthContextValue } from "@forge/web-kit";
