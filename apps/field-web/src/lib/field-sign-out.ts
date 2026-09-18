/**
 * Field sign-out: clear offline caches before Cognito/session logout.
 * Prefer AuthProvider.logout after ApiBootstrap registers purgeFieldForgeBrowserState;
 * this helper remains for call sites that need an explicit pre-clear.
 */
import { purgeFieldForgeBrowserState } from "./forge-browser-purge";

export function clearFieldOfflineOnSignOut(): void {
  void purgeFieldForgeBrowserState("logout");
}

/** Use when calling AuthProvider.logout from Field UI. */
export async function fieldSignOut(logout: () => Promise<void> | void): Promise<void> {
  await purgeFieldForgeBrowserState("logout");
  await logout();
}
