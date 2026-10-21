/**
 * Field sign-out: AuthProvider.logout already runs RG-09 purge via ApiBootstrap.
 * Do not await a second IndexedDB/SW purge here — Android Chrome can hang on
 * deleteDatabase/unregister and never reach the Cognito logout redirect.
 */
export function clearFieldOfflineOnSignOut(): void {
  // Fire-and-forget; logout path owns timed cleanup.
  void import("./forge-browser-purge").then(({ purgeFieldForgeBrowserState }) => {
    void purgeFieldForgeBrowserState("logout");
  });
}

/** Use when calling AuthProvider.logout from Field UI. */
export async function fieldSignOut(logout: () => Promise<void> | void): Promise<void> {
  await logout();
}
