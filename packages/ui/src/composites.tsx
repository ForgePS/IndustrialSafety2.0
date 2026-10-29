"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./primitives.js";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return <span className={`forge-status-badge forge-status-badge--${tone}`}>{children}</span>;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="forge-loading-state" role="status" aria-live="polite">
      <span
        className="forge-skeleton"
        style={{ width: "1.25rem", height: "1.25rem", borderRadius: "50%" }}
      />
      <span>{label}</span>
    </div>
  );
}

export type TabItem = { id: string; label: string; disabled?: boolean };

export function Tabs({
  items,
  value,
  onChange,
  children,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="forge-tabs">
      <div className="forge-tabs__list" role="tablist">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={value === item.id}
            disabled={item.disabled}
            className={["forge-tabs__tab", value === item.id ? "is-active" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {children ? (
        <div className="forge-tabs__panel" role="tabpanel">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="forge-form-section">
      <header className="forge-form-section__header">
        <h3 className="forge-form-section__title">{title}</h3>
        {description ? <p className="forge-form-section__desc">{description}</p> : null}
      </header>
      <div className="forge-form-section__body">{children}</div>
    </section>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={["forge-form-field", error ? "has-error" : ""].filter(Boolean).join(" ")}>
      <label className="forge-form-field__label" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="forge-form-field__hint">{hint}</p> : null}
      {error ? (
        <p className="forge-form-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children,
  side = "right",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="forge-drawer-root" role="presentation">
      <button
        type="button"
        className="forge-drawer-backdrop"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className={`forge-drawer forge-drawer--${side}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="forge-drawer__header">
          <h2 id={titleId}>{title}</h2>
          <Button variant="outline" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </header>
        <div className="forge-drawer__body">{children}</div>
      </aside>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="forge-dialog-backdrop" role="presentation">
      <button
        type="button"
        className="forge-dialog-backdrop__hit"
        aria-label="Close dialog"
        onClick={onCancel}
      />
      <div className="forge-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="forge-dialog__title">
          {title}
        </h2>
        <div className="forge-dialog__body">{description}</div>
        <div className="forge-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="forge-btn forge-btn--secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "forge-btn forge-btn--danger" : "forge-btn"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer ConfirmationDialog */
export const ConfirmDialog = ConfirmationDialog;

type ToastTone = "info" | "success" | "danger" | "warning";
type ToastItem = { id: string; message: string; tone: ToastTone };

type ToastContextValue = {
  push: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="forge-toast-region" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={`forge-toast forge-toast--${t.tone}`} role="status">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { push: () => undefined };
  }
  return ctx;
}
