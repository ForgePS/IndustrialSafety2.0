"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  UNSAVED_CHANGE_EVENT,
  isLeaveNavigation,
  isModifiedClick,
  isSaveableForm,
  resolveAnchorHref,
  shouldTrackUnsavedField,
} from "@/lib/unsaved-changes";

type PendingLeave =
  | { kind: "href"; href: string }
  | { kind: "back" }
  | { kind: "action"; run: () => void };

type UnsavedChangesApi = {
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
  confirmLeave: (run: () => void) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesApi | null>(null);

export function useUnsavedChanges(): UnsavedChangesApi {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) {
    return {
      isDirty: false,
      markDirty: () => undefined,
      markClean: () => undefined,
      confirmLeave: (run) => run(),
    };
  }
  return ctx;
}

/** Register a programmatic dirty flag (canvas editors, type=button saves). */
export function useRegisterUnsavedChanges(dirty: boolean): void {
  const { markDirty, markClean } = useUnsavedChanges();
  useEffect(() => {
    if (!dirty) return;
    markDirty();
    return () => markClean();
  }, [dirty, markDirty, markClean]);
}

function UnsavedChangesModal({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    stayRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onStay();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onStay]);

  if (!open) return null;

  return (
    <>
      <div className="modal-backdrop fade show ind-unsaved-backdrop" aria-hidden="true" />
      <div
        className="modal fade show d-block ind-unsaved-modal"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="unsaved-changes-title">
                Save your changes?
              </h5>
            </div>
            <div className="modal-body">
              <p className="mb-0">
                You have changes on this screen that have not been saved. Stay to save them, or
                leave without saving.
              </p>
            </div>
            <div className="modal-footer">
              <button ref={stayRef} type="button" className="btn btn-primary" onClick={onStay}>
                Stay and save
              </button>
              <button type="button" className="btn btn-outline-danger" onClick={onLeave}>
                Leave without saving
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [autoDirty, setAutoDirty] = useState(false);
  const [manualCount, setManualCount] = useState(0);
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const dirtyRef = useRef(false);
  const bypassRef = useRef(false);
  const guardPushedRef = useRef(false);

  const isDirty = autoDirty || manualCount > 0;
  dirtyRef.current = isDirty;

  const markDirty = useCallback(() => {
    setManualCount((count) => count + 1);
  }, []);

  const markClean = useCallback(() => {
    setManualCount((count) => Math.max(0, count - 1));
  }, []);

  useEffect(() => {
    setAutoDirty(false);
    setManualCount(0);
    setPending(null);
    bypassRef.current = false;
    guardPushedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    const onField = (event: Event) => {
      if (shouldTrackUnsavedField(event.target)) setAutoDirty(true);
    };
    const onCustom = () => setAutoDirty(true);
    const onSubmit = (event: Event) => {
      if (event.target instanceof HTMLFormElement && isSaveableForm(event.target)) {
        window.setTimeout(() => setAutoDirty(false), 0);
      }
    };

    document.addEventListener("input", onField, true);
    document.addEventListener("change", onField, true);
    window.addEventListener(UNSAVED_CHANGE_EVENT, onCustom);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("input", onField, true);
      document.removeEventListener("change", onField, true);
      window.removeEventListener(UNSAVED_CHANGE_EVENT, onCustom);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || bypassRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!isDirty) {
      guardPushedRef.current = false;
      return;
    }
    if (!guardPushedRef.current) {
      window.history.pushState({ forgeUnsavedGuard: true }, "", window.location.href);
      guardPushedRef.current = true;
    }

    const onPopState = () => {
      if (!dirtyRef.current || bypassRef.current) return;
      window.history.pushState({ forgeUnsavedGuard: true }, "", window.location.href);
      setPending({ kind: "back" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isDirty]);

  const requestLeave = useCallback(
    (next: PendingLeave) => {
      if (!dirtyRef.current || bypassRef.current) {
        if (next.kind === "href") router.push(next.href);
        else if (next.kind === "back") window.history.back();
        else next.run();
        return;
      }
      setPending(next);
    },
    [router],
  );

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || bypassRef.current) return;
      if (isModifiedClick(event) || event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".ind-unsaved-modal, .ind-unsaved-backdrop")) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = resolveAnchorHref(anchor, window.location.href);
      if (!href || !isLeaveNavigation(window.location.href, href)) return;
      event.preventDefault();
      event.stopPropagation();
      requestLeave({ kind: "href", href });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [requestLeave]);

  const confirmLeave = useCallback(
    (run: () => void) => {
      requestLeave({ kind: "action", run });
    },
    [requestLeave],
  );

  const stay = useCallback(() => setPending(null), []);

  const leave = useCallback(() => {
    const next = pending;
    setPending(null);
    setAutoDirty(false);
    setManualCount(0);
    bypassRef.current = true;
    if (!next) return;
    if (next.kind === "href") {
      const dest = new URL(next.href, window.location.href);
      if (dest.origin === window.location.origin) {
        router.push(`${dest.pathname}${dest.search}${dest.hash}`);
      } else {
        window.location.assign(dest.href);
      }
      return;
    }
    if (next.kind === "back") {
      guardPushedRef.current = false;
      window.history.go(-2);
      return;
    }
    next.run();
  }, [pending, router]);

  const api = useMemo<UnsavedChangesApi>(
    () => ({ isDirty, markDirty, markClean, confirmLeave }),
    [isDirty, markDirty, markClean, confirmLeave],
  );

  return (
    <UnsavedChangesContext.Provider value={api}>
      {children}
      <UnsavedChangesModal open={pending !== null} onStay={stay} onLeave={leave} />
    </UnsavedChangesContext.Provider>
  );
}
