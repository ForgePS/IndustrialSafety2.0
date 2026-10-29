/**
 * Non-sensitive FX module presentation diagnostics.
 * Never log tokens, secrets, narratives, or PII.
 */
export function logFxModulePresentation(event: {
  module: string;
  surface: string;
  mode: "fx" | "legacy";
  reason: string;
}): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_FX_RMS_DIAGNOSTICS !== "true"
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[rms-fx-module]", event.module, event.surface, event.mode, event.reason);
}

export function logFxModuleFallback(event: {
  module: string;
  surface: string;
  reason: string;
}): void {
  logFxModulePresentation({ ...event, mode: "legacy" });
}
