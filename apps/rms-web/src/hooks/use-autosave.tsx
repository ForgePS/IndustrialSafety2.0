"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiConflictError, ApiError } from "@forge/web-kit";
import styles from "../app/page.module.css";

export type AutosaveStatus =
  "idle" | "dirty" | "saving" | "saved" | "error" | "offline" | "conflict";

const DEFAULT_DELAY_MS = 2000;
const DEFAULT_MAX_WAIT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;

function isTransientError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 0 || err.status >= 500;
  }
  if (err instanceof TypeError) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useDebouncedAutosave<T>(options: {
  delayMs?: number;
  maxWaitMs?: number;
  maxRetries?: number;
  draftKey?: string;
  save: (value: T) => Promise<void>;
  onConflict?: (error: ApiConflictError, draft: T) => void;
}) {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<T | null>(null);
  const savingRef = useRef(false);

  const persistDraft = useCallback(
    (value: T) => {
      if (!options.draftKey) return;
      try {
        sessionStorage.setItem(options.draftKey, JSON.stringify(value));
      } catch {
        // Ignore quota errors.
      }
    },
    [options.draftKey],
  );

  const clearDraft = useCallback(() => {
    if (!options.draftKey) return;
    try {
      sessionStorage.removeItem(options.draftKey);
    } catch {
      // Ignore.
    }
  }, [options.draftKey]);

  const performSave = useCallback(async () => {
    if (latestRef.current === null || savingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      setError("You appear to be offline. Changes will save when connectivity returns.");
      return;
    }

    savingRef.current = true;
    setStatus("saving");
    setError(null);

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        await options.save(latestRef.current as T);
        savingRef.current = false;
        setStatus("saved");
        clearDraft();
        return;
      } catch (err) {
        if (err instanceof ApiConflictError) {
          savingRef.current = false;
          setStatus("conflict");
          if (latestRef.current !== null) {
            persistDraft(latestRef.current);
            options.onConflict?.(err, latestRef.current);
          }
          return;
        }
        if (isTransientError(err) && attempt < maxRetries) {
          attempt += 1;
          await sleep(400 * attempt);
          continue;
        }
        savingRef.current = false;
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setStatus("offline");
          setError("You appear to be offline. Changes will save when connectivity returns.");
        } else {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Autosave failed");
        }
        return;
      }
    }
  }, [clearDraft, maxRetries, options, persistDraft]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void performSave();
      if (maxWaitTimerRef.current) {
        clearTimeout(maxWaitTimerRef.current);
        maxWaitTimerRef.current = null;
      }
    }, delayMs);
  }, [delayMs, performSave]);

  // Online recovery only — do not clear debounce timers here. Depending on
  // `status`/`performSave` would cancel the pending save when queueSave sets
  // status to "dirty".
  useEffect(() => {
    function handleOnline() {
      if (latestRef.current !== null) {
        void performSave();
      }
    }
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [performSave]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
    };
  }, []);

  function queueSave(value: T) {
    latestRef.current = value;
    persistDraft(value);
    setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "dirty");
    setError(null);
    scheduleSave();
    if (!maxWaitTimerRef.current) {
      maxWaitTimerRef.current = setTimeout(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        void performSave();
        maxWaitTimerRef.current = null;
      }, maxWaitMs);
    }
  }

  async function flushSave(): Promise<void> {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
    await performSave();
  }

  function retrySave() {
    void performSave();
  }

  function resetStatus() {
    setStatus("idle");
    setError(null);
  }

  function restoreDraft(): T | null {
    if (!options.draftKey) return null;
    try {
      const raw = sessionStorage.getItem(options.draftKey);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  return { status, error, queueSave, flushSave, retrySave, resetStatus, restoreDraft };
}

export function AutosaveIndicator({
  status,
  error,
  onRetry,
}: {
  status: AutosaveStatus;
  error: string | null;
  onRetry?: () => void;
}) {
  if (status === "idle") return null;
  const className =
    status === "saving" || status === "dirty"
      ? `${styles.autosave} ${styles.autosaveSaving}`
      : status === "saved"
        ? `${styles.autosave} ${styles.autosaveSaved}`
        : `${styles.autosave} ${styles.autosaveError}`;

  const label =
    status === "dirty"
      ? "Unsaved changes"
      : status === "saving"
        ? "Saving…"
        : status === "saved"
          ? "All changes saved"
          : status === "offline"
            ? "Offline — changes queued"
            : status === "conflict"
              ? "Save conflict"
              : (error ?? "Save failed");

  return (
    <span className={className} aria-live="polite">
      {label}
      {status === "error" || status === "offline" ? (
        <>
          {" "}
          <button type="button" className={styles.autosaveRetry} onClick={onRetry}>
            Retry
          </button>
        </>
      ) : null}
    </span>
  );
}

export function SaveAndExitButton({
  disabled,
  onSave,
}: {
  disabled?: boolean;
  onSave: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={styles.buttonSecondary}
      disabled={disabled || busy}
      onClick={() => {
        setBusy(true);
        void onSave().finally(() => setBusy(false));
      }}
    >
      {busy ? "Saving…" : "Save and exit"}
    </button>
  );
}

export function ConflictDialog({
  open,
  message,
  onReload,
  onRetry,
  onDismiss,
}: {
  open: boolean;
  message: string;
  onReload: () => void;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;
  return (
    <div className={styles.conflictOverlay} role="presentation">
      <div
        className={styles.conflictDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        aria-describedby="conflict-description"
      >
        <h2 id="conflict-title">Edit conflict</h2>
        <p id="conflict-description">
          {message || "This incident was updated elsewhere. Reload to continue editing safely."}
        </p>
        <p className={styles.muted}>Your local draft is preserved in this browser session.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onReload}>
            Reload incident
          </button>
          {onRetry ? (
            <button type="button" className={styles.buttonSecondary} onClick={onRetry}>
              Retry save
            </button>
          ) : null}
          <button type="button" className={styles.buttonSecondary} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function readAutosaveDraft<T>(draftKey: string): T | null {
  try {
    const raw = sessionStorage.getItem(draftKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
