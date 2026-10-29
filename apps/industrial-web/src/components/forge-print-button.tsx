"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { ForgePrintDialog, type ForgePrintDialogBatchItem } from "@/components/forge-print-dialog";

export type ForgePrintButtonProps = {
  module: string;
  recordType: string;
  recordId?: string | undefined;
  fieldValues?: Record<string, string> | undefined;
  /**
   * Optional async prep before opening (e.g. ensure QR payload).
   * Returned keys merge over fieldValues.
   */
  onPrepare?: () => Promise<Record<string, string> | void>;
  defaultTitle?: string | undefined;
  widthInches?: number | undefined;
  heightInches?: number | undefined;
  locationId?: string | null | undefined;
  divisionId?: string | null | undefined;
  /** Reserved for future template auto-resolve; unused by dialog today. */
  documentType?: string | undefined;
  label?: string | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
  /** When length > 1, opens dialog in batch mode. */
  items?: ForgePrintDialogBatchItem[] | undefined;
};

/**
 * Universal Forge Print Label control. Modules must not call printer APIs directly —
 * pass module/record metadata + fieldValues and let Print Manager handle destination.
 */
export function ForgePrintButton({
  module,
  recordType,
  recordId,
  fieldValues,
  onPrepare,
  defaultTitle = "PRINT LABEL",
  widthInches = 4,
  heightInches = 4,
  locationId,
  divisionId,
  label = "Print Label",
  className = "btn btn-sm btn-outline-secondary",
  disabled = false,
  items,
}: ForgePrintButtonProps) {
  const { hasAnyPermission } = useAuth();
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolvedFields, setResolvedFields] = useState<Record<string, string>>(fieldValues ?? {});
  const [error, setError] = useState<string | null>(null);

  const openDialog = useCallback(async () => {
    if (!canPrint || disabled || busy) return;
    setError(null);
    setBusy(true);
    try {
      let merged = { ...(fieldValues ?? {}) };
      if (onPrepare) {
        const extra = await onPrepare();
        if (extra) merged = { ...merged, ...extra };
      }
      setResolvedFields(merged);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare print.");
    } finally {
      setBusy(false);
    }
  }, [busy, canPrint, disabled, fieldValues, onPrepare]);

  if (!canPrint) return null;

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        onClick={(ev) => {
          ev.stopPropagation();
          void openDialog();
        }}
      >
        {busy ? "Preparing…" : label}
      </button>
      {error ? (
        <span className="text-danger small ms-1" role="alert">
          {error}
        </span>
      ) : null}
      <ForgePrintDialog
        open={open}
        onClose={() => setOpen(false)}
        module={module}
        recordType={recordType}
        {...(recordId ? { recordId } : {})}
        defaultTitle={defaultTitle}
        fieldValues={resolvedFields}
        widthInches={widthInches}
        heightInches={heightInches}
        {...(locationId !== undefined ? { locationId } : {})}
        {...(divisionId !== undefined ? { divisionId } : {})}
        {...(items && items.length > 1 ? { items } : {})}
      />
    </>
  );
}
