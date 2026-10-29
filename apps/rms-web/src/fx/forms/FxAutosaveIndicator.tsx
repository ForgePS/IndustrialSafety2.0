"use client";

import { AutosaveIndicator } from "@/hooks/use-autosave";

/** Presentation wrapper around existing RMS autosave indicator — no new autosave system. */
export function FxAutosaveIndicator(props: Parameters<typeof AutosaveIndicator>[0]) {
  return (
    <div className="rms-fx-autosave" aria-live="polite">
      <AutosaveIndicator {...props} />
    </div>
  );
}

export function FxDraftIndicator({ status = "draft" }: { status?: "draft" | "clean" | "unsaved" }) {
  const label = status === "draft" ? "Draft" : status === "unsaved" ? "Unsaved changes" : "Saved";
  return (
    <span className="rms-fx-draft" role="status">
      {label}
    </span>
  );
}
