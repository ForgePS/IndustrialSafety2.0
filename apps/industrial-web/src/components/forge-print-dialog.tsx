"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import {
  createPrintBatch,
  createPrintJob,
  connectionBadgeLabel,
  getPrinterProfile,
  isBluetoothPrinter,
  isDirectBluetoothPrinter,
  listLabelTemplates,
  listMediaProfiles,
  listPrinters,
  pollPrintBatchUntilTerminal,
  pollPrintJobUntilTerminal,
  previewPrintJob,
  printerDisplayName,
  reconnectPrinter,
  registerDirectBluetoothPrinter,
  getPrintBatch,
  type ForgePrinter,
  type LabelTemplate,
  type PrintBatchDetail,
  type PrintJobDetail,
  type PrintLabelLayout,
  type PrinterMediaProfile,
  type PrinterProfile,
} from "@/lib/print-api";

async function loadDirectPrint() {
  return import("@/lib/direct-print");
}

async function loadDirectBrady() {
  return import("@/lib/direct-brady-bluetooth");
}

async function loadDirectBatch() {
  return import("@/lib/direct-batch");
}

type DirectBatchRun = import("@/lib/direct-batch").DirectBatchRun;

const RESERVED_FIELD_KEYS = new Set([
  "title",
  "Title",
  "name",
  "qr",
  "qrPayload",
  "subtitle",
  "brand",
  "caption",
]);

const LAST_PRINTER_KEY = "forge.print.lastPrinterId";
const LAST_STOCK_KEY = "forge.print.lastStockId";
const LAST_COPIES_KEY = "forge.print.lastCopies";

type BuiltinStock = {
  id: string;
  label: string;
  widthInches: number;
  heightInches: number;
};

const BUILTIN_STOCK: BuiltinStock[] = [
  { id: "builtin:4x4", label: "4×4 Asset", widthInches: 4, heightInches: 4 },
  { id: "builtin:4x2", label: "4×2 Asset", widthInches: 4, heightInches: 2 },
  { id: "builtin:2x1", label: "2×1 Compact", widthInches: 2, heightInches: 1 },
  { id: "builtin:4x6", label: "4×6 Poster", widthInches: 4, heightInches: 6 },
];

export type ForgePrintDialogBatchItem = {
  recordId?: string | undefined;
  fieldValues?: Record<string, string> | undefined;
  title?: string | undefined;
};

export type ForgePrintDialogProps = {
  open: boolean;
  onClose: () => void;
  module?: string | undefined;
  recordType?: string | undefined;
  recordId?: string | undefined;
  defaultTitle?: string | undefined;
  fieldValues?: Record<string, string> | undefined;
  widthInches?: number | undefined;
  heightInches?: number | undefined;
  locationId?: string | null | undefined;
  divisionId?: string | null | undefined;
  /** When length > 1, submit via createPrintBatch. */
  items?: ForgePrintDialogBatchItem[] | undefined;
};

type Phase = "form" | "submitting" | "polling" | "failover" | "success" | "error";

function isUuid(value: string | undefined | null): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

function successCopy(status: string): string {
  if (String(status).toUpperCase() === "SENT_TO_PRINTER") return "Sent to Printer";
  return "Label Sent Successfully";
}

function printerStatusLabel(p: ForgePrinter | undefined): string {
  if (!p) return "—";
  if (!p.enabled) return "Disabled";
  if (p.ready) return "Ready";
  if (p.connected) return "Connected";
  if (p.online) return "Online";
  if (isBluetoothPrinter(p)) return "Bluetooth Disconnected";
  return "Offline";
}

function printerPathLabel(p: ForgePrinter | undefined): string {
  if (!p) return "—";
  if (isDirectBluetoothPrinter(p)) return "Direct Bluetooth";
  if (isBluetoothPrinter(p)) return "Bridge Bluetooth";
  return connectionBadgeLabel(p.connectionType) || "Bridge";
}

function statusBadgeClass(p: ForgePrinter | undefined): string {
  if (!p) return "bg-label-secondary";
  if (p.ready) return "bg-label-success";
  if (p.connected || p.online) return "bg-label-info";
  return "bg-label-warning";
}

function rankPrinters(
  items: ForgePrinter[],
  locationId?: string | null,
  divisionId?: string | null,
): ForgePrinter[] {
  return [...items].sort((a, b) => {
    const score = (p: ForgePrinter) => {
      let s = 0;
      if (locationId && p.locationId === locationId) s += 4;
      if (divisionId && p.divisionId === divisionId) s += 2;
      if (p.isDefault) s += 1;
      if (p.ready) s += 1;
      return s;
    };
    return score(b) - score(a);
  });
}

function parseFailoverHint(err: unknown): { primaryHint: string; fallbackHint: string } | null {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const code = err instanceof ApiError ? err.code : undefined;
  const haystack = `${code ?? ""} ${message}`;
  if (
    !/PRINTER_FAILOVER_AVAILABLE/i.test(haystack) &&
    !/Failover to .+ available/i.test(message) &&
    !/acceptFailover/i.test(message)
  ) {
    return null;
  }
  const match = message.match(/Failover to (.+?) available/i);
  const fallbackHint = match?.[1]?.trim() || "the fallback printer";
  const primaryHint = "Primary printer";
  return { primaryHint, fallbackHint };
}

function clampDim(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(12, Math.max(0.5, Math.round(n * 100) / 100));
}

function scaleFromSlider(pct: number): number {
  return Math.min(1.5, Math.max(0.5, pct / 100));
}

function dimsClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function matchBuiltinStock(width: number, height: number): string | null {
  const hit = BUILTIN_STOCK.find(
    (s) => dimsClose(s.widthInches, width) && dimsClose(s.heightInches, height),
  );
  return hit?.id ?? null;
}

function readLocal(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

export function ForgePrintDialog({
  open,
  onClose,
  module,
  recordType,
  recordId,
  defaultTitle = "PRINT LABEL",
  fieldValues = {},
  widthInches: widthInchesProp = 4,
  heightInches: heightInchesProp = 4,
  locationId,
  divisionId,
  items,
}: ForgePrintDialogProps) {
  const { hasAnyPermission, loading: authLoading } = useAuth();
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);
  const canView = hasAnyPermission([
    "industrial.printer.view",
    "industrial.printer.print",
    "industrial.admin",
  ]);
  const canPairBluetooth = hasAnyPermission([
    "industrial.printer.pair_bluetooth",
    "industrial.printer.manage",
    "industrial.admin",
  ]);

  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [printerId, setPrinterId] = useState("");
  const [copies, setCopies] = useState(() => {
    const saved = Number(readLocal(LAST_COPIES_KEY));
    return Number.isFinite(saved) && saved >= 1 && saved <= 100 ? Math.round(saved) : 1;
  });
  const [mediaProfiles, setMediaProfiles] = useState<PrinterMediaProfile[]>([]);
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [stockId, setStockId] = useState("builtin:4x4");
  const [labelWidthIn, setLabelWidthIn] = useState(widthInchesProp);
  const [labelHeightIn, setLabelHeightIn] = useState(heightInchesProp);
  const [orientation, setOrientation] = useState("AUTO");
  const [cutMode, setCutMode] = useState("");
  const [dpi, setDpi] = useState(300);
  const [templateId, setTemplateId] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [qrScalePct, setQrScalePct] = useState(100);
  const [textScalePct, setTextScalePct] = useState(100);
  const [includedFields, setIncludedFields] = useState<Record<string, boolean>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [webBtSupported, setWebBtSupported] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairMessage, setPairMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failoverHint, setFailoverHint] = useState<{
    primaryHint: string;
    fallbackHint: string;
  } | null>(null);
  const [job, setJob] = useState<PrintJobDetail | null>(null);
  const [batchResult, setBatchResult] = useState<PrintBatchDetail | null>(null);
  const [stopOnFail, setStopOnFail] = useState(true);
  const [startAt, setStartAt] = useState(1);
  const [pausedBatch, setPausedBatch] = useState<DirectBatchRun | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewSeqRef = useRef(0);
  const profileApplyRef = useRef(0);
  const copiesTouchedRef = useRef(false);
  const profileCopiesAppliedRef = useRef(false);

  const batchItems = useMemo(() => {
    if (items && items.length > 1) return items;
    return null;
  }, [items]);
  const batchCount = batchItems?.length ?? 1;

  useEffect(() => {
    setStartAt(1);
    setPausedBatch(null);
  }, [items]);

  function readSavedCopies(): number {
    const saved = Number(readLocal(LAST_COPIES_KEY));
    return Number.isFinite(saved) && saved >= 1 && saved <= 100 ? Math.round(saved) : 1;
  }

  function updateCopies(next: number | ((prev: number) => number)) {
    copiesTouchedRef.current = true;
    setCopies((prev) => {
      const raw = typeof next === "function" ? next(prev) : next;
      if (!Number.isFinite(raw)) return prev;
      return Math.min(100, Math.max(1, Math.round(raw)));
    });
  }

  const selected = useMemo(() => printers.find((p) => p.id === printerId), [printers, printerId]);
  const selectedIsBluetooth = isBluetoothPrinter(selected);
  const selectedIsDirect = isDirectBluetoothPrinter(selected);
  const selectedBluetoothDisconnected =
    selectedIsBluetooth &&
    !selectedIsDirect &&
    selected != null &&
    !selected.ready &&
    !selected.connected;
  const selectedSupportsCut = Boolean(selected?.supportsCut ?? selected?.capabilities?.cut);

  const mediaProfileId = stockId.startsWith("media:") ? stockId.slice("media:".length) : "";

  const title = useMemo(() => {
    return (fieldValues.title || fieldValues.Title || fieldValues.name || defaultTitle).trim();
  }, [defaultTitle, fieldValues]);

  const fieldValuesFingerprint = useMemo(
    () =>
      Object.entries(fieldValues)
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join("\n"),
    [fieldValues],
  );

  const stableFieldValues = useMemo(() => {
    return { ...fieldValues };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValuesFingerprint]);

  const adjustableFieldKeys = useMemo(() => {
    return Object.keys(stableFieldValues).filter((k) => !RESERVED_FIELD_KEYS.has(k));
  }, [stableFieldValues]);

  const filterIncludedFields = useCallback(
    (source: Record<string, string>, fallbackTitle: string): Record<string, string> => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(source)) {
        if (v == null || String(v).length === 0) continue;
        if (RESERVED_FIELD_KEYS.has(k)) {
          next[k] = String(v);
          continue;
        }
        if (includedFields[k] === true) next[k] = String(v);
      }
      if (!next.title && fallbackTitle) next.title = fallbackTitle;
      return next;
    },
    [includedFields],
  );

  const activeFieldValues = useMemo(
    () => filterIncludedFields(stableFieldValues, title),
    [filterIncludedFields, stableFieldValues, title],
  );

  const layoutOpts = useMemo((): PrintLabelLayout => {
    const qrScale = scaleFromSlider(qrScalePct);
    const textScale = scaleFromSlider(textScalePct);
    return {
      ...(qrScale !== 1 ? { qrScale } : {}),
      ...(textScale !== 1 ? { textScale } : {}),
    };
  }, [qrScalePct, textScalePct]);

  const jobExtras = useMemo(() => {
    return {
      dpi,
      orientation: orientation || "AUTO",
      ...(cutMode ? { cutMode } : {}),
      ...(mediaProfileId && isUuid(mediaProfileId) ? { mediaProfileId } : {}),
      ...(isUuid(locationId) ? { locationId } : {}),
      ...(isUuid(divisionId) ? { divisionId } : {}),
      ...(templateId && isUuid(templateId) ? { templateId } : {}),
    };
  }, [dpi, orientation, cutMode, mediaProfileId, locationId, divisionId, templateId]);

  const applyStockSelection = useCallback(
    (id: string, profiles: PrinterMediaProfile[] = mediaProfiles) => {
      setStockId(id);
      writeLocal(LAST_STOCK_KEY, id);
      if (id.startsWith("media:")) {
        const mid = id.slice("media:".length);
        const profile = profiles.find((p) => p.id === mid);
        if (profile) {
          setLabelWidthIn(clampDim(profile.widthInches, 4));
          setLabelHeightIn(clampDim(profile.heightInches, 4));
          if (profile.orientation) setOrientation(profile.orientation.toUpperCase());
        }
        return;
      }
      if (id === "custom") return;
      const builtin = BUILTIN_STOCK.find((s) => s.id === id);
      if (builtin) {
        setLabelWidthIn(builtin.widthInches);
        setLabelHeightIn(builtin.heightInches);
      }
    },
    [mediaProfiles],
  );

  const applyPrinterProfile = useCallback(
    async (printer: ForgePrinter, profiles: PrinterMediaProfile[]) => {
      const seq = ++profileApplyRef.current;
      try {
        const profile: PrinterProfile = await getPrinterProfile(printer.id);
        if (seq !== profileApplyRef.current) return;
        // Only seed copies from printer profile once per open, and never after the user edits qty.
        if (
          !copiesTouchedRef.current &&
          !profileCopiesAppliedRef.current &&
          profile.defaultCopies > 0
        ) {
          profileCopiesAppliedRef.current = true;
          setCopies(Math.min(100, profile.defaultCopies));
        }
        if (profile.dpi && profile.dpi > 0) setDpi(profile.dpi);
        else if (printer.dpi > 0) setDpi(printer.dpi);
        if (profile.defaultOrientation) {
          setOrientation(String(profile.defaultOrientation).toUpperCase());
        }
        if (profile.defaultCutMode) setCutMode(String(profile.defaultCutMode));
        if (profile.defaultMediaId && profiles.some((p) => p.id === profile.defaultMediaId)) {
          applyStockSelection(`media:${profile.defaultMediaId}`, profiles);
        }
      } catch {
        if (seq !== profileApplyRef.current) return;
        if (printer.dpi > 0) setDpi(printer.dpi);
      }
    },
    [applyStockSelection],
  );

  const loadPrinters = useCallback(async () => {
    if (!canView) return;
    setLoadError(null);
    try {
      const [rawItems, profiles, templateItems] = await Promise.all([
        listPrinters({ enabled: "true" }),
        listMediaProfiles().catch(() => [] as PrinterMediaProfile[]),
        listLabelTemplates().catch(() => [] as LabelTemplate[]),
      ]);
      const ranked = rankPrinters(rawItems, locationId, divisionId);
      setPrinters(ranked);
      setMediaProfiles(profiles);
      setTemplates(templateItems.filter((t) => t.enabled && t.publishedVersion != null));

      const lastPrinter = readLocal(LAST_PRINTER_KEY);
      const preferred =
        (lastPrinter && ranked.find((p) => p.id === lastPrinter)) ||
        ranked.find((p) => p.isDefault) ||
        ranked[0];
      const nextPrinterId = preferred?.id ?? "";
      setPrinterId(nextPrinterId);
      if (preferred) {
        void applyPrinterProfile(preferred, profiles);
      } else {
        const savedStock = readLocal(LAST_STOCK_KEY);
        if (
          savedStock?.startsWith("media:") &&
          profiles.some((p) => `media:${p.id}` === savedStock)
        ) {
          applyStockSelection(savedStock, profiles);
        }
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load printers.");
    }
  }, [canView, locationId, divisionId, applyPrinterProfile, applyStockSelection]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setPhase("form");
      setErrorMessage(null);
      setFailoverHint(null);
      setJob(null);
      setBatchResult(null);
      setReconnectMessage(null);
      setPairMessage(null);
      setPreviewUrl(null);
      setPreviewError(null);
      setAdvancedOpen(false);
      setTemplateId("");
      setIncludedFields({});
      copiesTouchedRef.current = false;
      profileCopiesAppliedRef.current = false;
      return;
    }

    // Seed qty only when the dialog opens — never when field values refresh mid-session.
    copiesTouchedRef.current = false;
    profileCopiesAppliedRef.current = false;
    setCopies(readSavedCopies());
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const w = clampDim(widthInchesProp, 4);
    const h = clampDim(heightInchesProp, 4);
    setLabelWidthIn(w);
    setLabelHeightIn(h);
    setQrScalePct(100);
    setTextScalePct(100);
    setOrientation("AUTO");
    setCutMode("");
    setDpi(300);

    const lastStock = readLocal(LAST_STOCK_KEY);
    const fromProps = matchBuiltinStock(w, h);
    const initialStock = fromProps ?? lastStock ?? "builtin:4x4";
    if (initialStock.startsWith("builtin:") || initialStock === "custom") {
      setStockId(initialStock === "custom" ? (fromProps ?? "builtin:4x4") : initialStock);
      const builtin = BUILTIN_STOCK.find((s) => s.id === (fromProps ?? initialStock));
      if (builtin && !fromProps) {
        setLabelWidthIn(builtin.widthInches);
        setLabelHeightIn(builtin.heightInches);
      } else if (fromProps) {
        setStockId(fromProps);
      }
    } else if (initialStock.startsWith("media:")) {
      setStockId(initialStock);
    } else {
      setStockId(fromProps ?? "builtin:4x4");
    }

    // Content fields are opt-in; start unchecked so labels default to title + QR only.
    const defaults: Record<string, boolean> = {};
    for (const k of Object.keys(stableFieldValues)) {
      if (!RESERVED_FIELD_KEYS.has(k)) defaults[k] = false;
    }
    setIncludedFields(defaults);
  }, [
    open,
    widthInchesProp,
    heightInchesProp,
    recordId,
    fieldValuesFingerprint,
    stableFieldValues,
  ]);

  useEffect(() => {
    if (!open) return;
    void loadPrinters();
    const bt = typeof navigator !== "undefined" && "bluetooth" in navigator;
    setWebBtSupported(bt);
    if (bt) {
      void import("@/lib/direct-brady-bluetooth").then((m) => m.warmDirectBradySdk());
    }
    // Intentionally only re-load when the dialog opens — not when loadPrinters identity changes
    // (that was resetting copies via printer profile defaultCopies).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open || !canView) return;
    if (phase !== "form" && phase !== "submitting" && phase !== "polling") return;

    const seq = ++previewSeqRef.current;
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await previewPrintJob({
            widthInches: labelWidthIn,
            heightInches: labelHeightIn,
            dpi,
            orientation,
            fieldValues: activeFieldValues,
            ...(module ? { module } : {}),
            ...(Object.keys(layoutOpts).length > 0 ? { layout: layoutOpts } : {}),
            ...(mediaProfileId && isUuid(mediaProfileId) ? { mediaProfileId } : {}),
          });
          if (seq !== previewSeqRef.current) return;
          const url =
            result.contentType === "image/png" && result.base64
              ? `data:image/png;base64,${result.base64}`
              : result.previewDataUrl;
          setPreviewUrl(url);
          setPreviewError(null);
        } catch (err) {
          if (seq !== previewSeqRef.current) return;
          setPreviewError(
            err instanceof ApiError ? err.message : "Could not render label preview.",
          );
        } finally {
          if (seq === previewSeqRef.current) setPreviewLoading(false);
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    open,
    canView,
    phase,
    labelWidthIn,
    labelHeightIn,
    dpi,
    orientation,
    activeFieldValues,
    module,
    layoutOpts,
    mediaProfileId,
  ]);

  async function handlePairDirect() {
    if (!canPairBluetooth) return;
    setPairBusy(true);
    setPairMessage(null);
    try {
      const { pairDirectBradyPrinter } = await loadDirectBrady();
      const paired = await pairDirectBradyPrinter();
      const savedId = String(paired.savedId ?? "").trim();
      const deviceId = String(paired.deviceId ?? "").trim();
      if (!savedId) {
        throw new Error("Brady pairing did not return a saved device id.");
      }
      const name = paired.name || "Brady Direct Bluetooth";
      const registered = await registerDirectBluetoothPrinter({
        name,
        displayName: name,
        bluetoothSavedId: savedId,
        ...(deviceId ? { bluetoothDeviceId: deviceId } : {}),
        ...(isUuid(locationId) ? { locationId } : {}),
        ...(isUuid(divisionId) ? { divisionId } : {}),
      });
      setPairMessage(`Paired ${printerDisplayName(registered)}.`);
      await loadPrinters();
      setPrinterId(registered.id);
      writeLocal(LAST_PRINTER_KEY, registered.id);
    } catch (err) {
      setPairMessage(err instanceof Error ? err.message : "Could not pair Brady printer.");
    } finally {
      setPairBusy(false);
    }
  }

  async function handleReconnect() {
    if (!selected || !canPairBluetooth) return;
    setReconnectBusy(true);
    setReconnectMessage(null);
    try {
      const result = await reconnectPrinter(selected.id);
      setReconnectMessage(
        result.message ??
          "Reconnect requested. Keep the Forge Bluetooth Printer Companion open near the printer.",
      );
      await loadPrinters();
    } catch (err) {
      setReconnectMessage(
        err instanceof ApiError ? err.message : "Could not request Bluetooth reconnect.",
      );
    } finally {
      setReconnectBusy(false);
    }
  }

  function onPrinterChange(id: string) {
    setPrinterId(id);
    writeLocal(LAST_PRINTER_KEY, id);
    const printer = printers.find((p) => p.id === id);
    if (printer) void applyPrinterProfile(printer, mediaProfiles);
  }

  function onCustomSizeChange(nextW: number, nextH: number) {
    setLabelWidthIn(nextW);
    setLabelHeightIn(nextH);
    const builtin = matchBuiltinStock(nextW, nextH);
    if (builtin) {
      setStockId(builtin);
      writeLocal(LAST_STOCK_KEY, builtin);
    } else {
      setStockId("custom");
      writeLocal(LAST_STOCK_KEY, "custom");
    }
  }

  async function runDirectBatchInDialog(run: DirectBatchRun, signal: AbortSignal) {
    try {
      const { runDirectBatch } = await loadDirectBatch();
      const outcome = await runDirectBatch(run, {
        stopOnFail,
        signal,
        onProgress: setProgressText,
      });
      setProgressText(null);
      if (outcome.kind === "paused") {
        setPausedBatch(outcome.run);
        setStartAt(outcome.label);
        setErrorMessage(outcome.message);
        setPhase("error");
        return;
      }
      setPausedBatch(null);
      setStartAt(1);
      const refreshed = await getPrintBatch(run.batchId).catch(() => null);
      if (refreshed) setBatchResult(refreshed);
      setPhase("success");
    } catch (err) {
      setProgressText(null);
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      setErrorMessage(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Batch direct print failed.",
      );
      setPhase("error");
    }
  }

  async function resumeBatch() {
    if (!pausedBatch || !canPrint) return;
    const run = pausedBatch;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setErrorMessage(null);
    setPhase("polling");
    setProgressText("Reconnecting to the Brady…");
    try {
      const brady = await loadDirectBrady();
      await brady.ensureDirectBradyConnected(run.printer.bluetoothSavedId);
      await runDirectBatchInDialog(run, ac.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setProgressText(null);
      setErrorMessage(err instanceof Error ? err.message : "Could not reconnect to the Brady.");
      setPhase("error");
    }
  }

  async function runPrint(opts?: { acceptFailover?: boolean }) {
    if (!canPrint || !printerId || !selected) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("submitting");
    setErrorMessage(null);
    setFailoverHint(null);
    setJob(null);
    setBatchResult(null);
    setProgressText(null);
    writeLocal(LAST_PRINTER_KEY, printerId);
    writeLocal(LAST_STOCK_KEY, stockId);
    writeLocal(LAST_COPIES_KEY, String(copies));

    const failoverOpts = opts?.acceptFailover ? { acceptFailover: true as const } : {};
    const printMode = selectedIsDirect ? ("DIRECT_BLUETOOTH" as const) : ("BRIDGE" as const);
    const layoutBody = Object.keys(layoutOpts).length > 0 ? { layout: layoutOpts } : {};
    const safeFieldValues = Object.fromEntries(
      Object.entries(activeFieldValues)
        .filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === "string" && entry[1] != null && String(entry[1]).length > 0,
        )
        .map(([k, v]) => [k, String(v)]),
    );

    try {
      if (selectedIsDirect) {
        const { ensureDirectBradyConnected } = await import("@/lib/direct-brady-bluetooth");
        await ensureDirectBradyConnected(selected.bluetoothSavedId);
      }

      if (batchItems) {
        setPausedBatch(null);
        const firstLabel = Math.min(Math.max(1, Math.floor(startAt) || 1), batchItems.length);
        const runItems = batchItems.slice(firstLabel - 1);
        const batch = await createPrintBatch({
          printerId,
          copiesPerItem: copies,
          widthInches: labelWidthIn,
          heightInches: labelHeightIn,
          printMode,
          stopOnFail,
          items: runItems.map((item) => ({
            ...(module ? { module } : {}),
            ...(recordType ? { recordType } : {}),
            ...(isUuid(item.recordId) ? { recordId: item.recordId } : {}),
            ...(item.title ? { title: item.title } : {}),
            fieldValues: item.fieldValues
              ? filterIncludedFields(item.fieldValues, item.title ?? "")
              : safeFieldValues,
          })),
          ...layoutBody,
          ...jobExtras,
          ...failoverOpts,
        });
        setBatchResult(batch);

        if (selectedIsDirect) {
          setPhase("polling");
          await runDirectBatchInDialog(
            {
              batchId: batch.id,
              jobIds: (batch.jobs ?? []).map((j) => j.id),
              nextIndex: 0,
              labelOffset: firstLabel - 1,
              totalLabels: batchItems.length,
              copies,
              failed: 0,
              printer: selected,
            },
            ac.signal,
          );
          return;
        }

        setPhase("polling");
        const finalBatch = await pollPrintBatchUntilTerminal(batch.id, {
          signal: ac.signal,
          maxAttempts: selectedIsBluetooth ? 180 : 120,
          intervalMs: 2000,
        });
        setBatchResult(finalBatch);
        const status = String(finalBatch.status ?? "").toUpperCase();
        if (status === "FAILED") {
          setErrorMessage(
            `${finalBatch.failedJobs} of ${finalBatch.totalJobs} labels failed. Open Print Manager → Batches for details.`,
          );
          setPhase("error");
          return;
        }
        setPhase("success");
        return;
      }

      if (selectedIsDirect) {
        const { createAndPrintDirect } = await loadDirectPrint();
        const result = await createAndPrintDirect(selected, {
          copies,
          widthInches: labelWidthIn,
          heightInches: labelHeightIn,
          fieldValues: safeFieldValues,
          ...(module ? { module } : {}),
          ...(recordType ? { recordType } : {}),
          ...(isUuid(recordId) ? { recordId } : {}),
          ...layoutBody,
          ...jobExtras,
          ...failoverOpts,
        });
        setJob(result.job);
        if (result.ok) {
          setPhase("success");
        } else {
          setErrorMessage(result.message ?? "Direct Bluetooth print failed.");
          setPhase("error");
        }
        return;
      }

      const created = await createPrintJob({
        printerId,
        copies,
        widthInches: labelWidthIn,
        heightInches: labelHeightIn,
        printMode: "BRIDGE",
        fieldValues: safeFieldValues,
        ...(module ? { module } : {}),
        ...(recordType ? { recordType } : {}),
        ...(isUuid(recordId) ? { recordId } : {}),
        ...layoutBody,
        ...jobExtras,
        ...failoverOpts,
      });
      setJob(created);
      setPhase("polling");
      const finalJob = await pollPrintJobUntilTerminal(created.id, {
        signal: ac.signal,
        maxAttempts: selectedIsBluetooth ? 120 : 80,
        intervalMs: 2000,
      });
      setJob(finalJob);
      const status = String(finalJob.status ?? "").toUpperCase();
      if (status === "COMPLETED" || status === "SENT_TO_PRINTER") {
        setPhase("success");
      } else if (status === "WAITING_FOR_PRINTER") {
        setErrorMessage(
          selectedIsBluetooth
            ? `${printerDisplayName(selected)} is out of range or disconnected. The job is waiting — bring the printer near the Bridge and keep the Bluetooth Companion open.`
            : "Printer is unavailable. The job is waiting for the printer.",
        );
        setPhase("error");
      } else {
        setErrorMessage(
          finalJob.errorMessage ||
            (status === "CANCELLED"
              ? "Print job was cancelled."
              : status === "EXPIRED"
                ? "Print job expired before the bridge claimed it."
                : selectedIsBluetooth
                  ? "Bluetooth connection was lost before the job could be transmitted."
                  : "Print job failed."),
        );
        setPhase("error");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const failover = parseFailoverHint(err);
      if (failover && !opts?.acceptFailover) {
        setFailoverHint(failover);
        setPhase("failover");
        return;
      }
      setErrorMessage(err instanceof ApiError ? err.message : "Could not submit print job.");
      setPhase("error");
    }
  }

  if (!open) return null;

  const printButtonLabel =
    phase === "submitting" || phase === "polling"
      ? "Printing…"
      : batchCount > 1
        ? copies > 1
          ? `PRINT ${Math.max(1, batchCount - startAt + 1)} LABELS × ${copies}`
          : `PRINT ${Math.max(1, batchCount - startAt + 1)} LABELS`
        : copies > 1
          ? `Print ${copies} copies`
          : "Print";

  const formDisabled = phase !== "form";
  const stockLabel =
    BUILTIN_STOCK.find((s) => s.id === stockId)?.label ??
    mediaProfiles.find((m) => `media:${m.id}` === stockId)?.name ??
    "Custom size";

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="forge-print-dialog-title"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={() => {
        if (phase === "submitting" || phase === "polling") return;
        onClose();
      }}
      onKeyDown={(ev) => {
        if (ev.key === "Escape" && phase !== "submitting" && phase !== "polling") onClose();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="modal-dialog modal-dialog-centered modal-xl"
        role="document"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title text-uppercase mb-0" id="forge-print-dialog-title">
                {defaultTitle}
              </h5>
              {title && title !== defaultTitle ? (
                <p className="small text-muted mb-0 mt-1">{title}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              disabled={phase === "submitting" || phase === "polling"}
              onClick={onClose}
            />
          </div>
          <div className="modal-body">
            {authLoading ? <p className="text-muted mb-0">Loading…</p> : null}

            {!authLoading && !canView ? (
              <div className="alert alert-warning mb-0" role="alert">
                You need printer view permission to open this dialog.
              </div>
            ) : null}

            {!authLoading && canView && phase === "success" ? (
              <div className="text-center py-4">
                <span className="avatar avatar-md mb-3">
                  <span className="avatar-initial rounded-circle bg-label-success">
                    <i className="bx bx-check bx-sm" />
                  </span>
                </span>
                {batchResult ? (
                  <>
                    <h6 className="mb-1">
                      {batchResult.status === "PARTIAL"
                        ? "Batch finished with some failures"
                        : `Batch of ${batchResult.totalJobs} labels complete`}
                    </h6>
                    <p className="text-muted small mb-0">
                      Completed {batchResult.completedJobs} · Failed {batchResult.failedJobs} ·
                      Status {batchResult.status}
                    </p>
                  </>
                ) : (
                  <>
                    <h6 className="mb-1">{successCopy(job?.status ?? "COMPLETED")}</h6>
                    <p className="text-muted small mb-0">
                      Job status: {String(job?.status ?? "").replace(/_/g, " ")}
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {!authLoading && canView && phase === "failover" && failoverHint ? (
              <div>
                <div className="alert alert-warning" role="alert">
                  {failoverHint.primaryHint} is unavailable. Print using {failoverHint.fallbackHint}{" "}
                  instead?
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void runPrint({ acceptFailover: true })}
                  >
                    Print with failover
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setPhase("form");
                      setFailoverHint(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {!authLoading && canView && phase === "error" ? (
              <div>
                <div className="alert alert-danger" role="alert">
                  {errorMessage ?? "Print failed."}
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {pausedBatch ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!canPrint}
                      onClick={() => void resumeBatch()}
                    >
                      {`Resume at label ${pausedBatch.labelOffset + pausedBatch.nextIndex + 1}`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={pausedBatch ? "btn btn-outline-primary" : "btn btn-primary"}
                    disabled={!canPrint}
                    onClick={() => void runPrint()}
                  >
                    {pausedBatch ? "Start a new batch" : "Try again"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setPhase("form");
                      setErrorMessage(null);
                    }}
                  >
                    Back to settings
                  </button>
                  <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {!authLoading &&
            canView &&
            (phase === "form" || phase === "submitting" || phase === "polling") ? (
              <>
                {loadError ? (
                  <div className="alert alert-danger" role="alert">
                    {loadError}
                  </div>
                ) : null}

                <div className="row g-4">
                  <div className="col-lg-5">
                    <div className="d-flex justify-content-between align-items-baseline mb-2">
                      <span className="form-label mb-0">Preview</span>
                      <span className="small text-muted">
                        {stockLabel} · {labelWidthIn}&times;{labelHeightIn} in
                        {orientation !== "AUTO" ? ` · ${orientation}` : ""}
                      </span>
                    </div>
                    <div
                      className="border rounded bg-light d-flex align-items-center justify-content-center p-3"
                      style={{ minHeight: 280 }}
                    >
                      {previewLoading && !previewUrl ? (
                        <p className="text-muted small mb-0">Rendering preview…</p>
                      ) : null}
                      {previewError && !previewUrl ? (
                        <p className="text-danger small mb-0">{previewError}</p>
                      ) : null}
                      {previewUrl ? (
                        // Plain <img> on purpose: static export, so next/image optimization is unavailable.
                        <img
                          src={previewUrl}
                          alt="Label preview"
                          style={{
                            maxWidth: "100%",
                            maxHeight: 340,
                            width: "auto",
                            height: "auto",
                            imageRendering: "pixelated",
                            opacity: previewLoading ? 0.55 : 1,
                            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                            background: "#fff",
                            transform:
                              orientation === "LANDSCAPE"
                                ? "rotate(90deg)"
                                : orientation === "PORTRAIT"
                                  ? "none"
                                  : undefined,
                          }}
                        />
                      ) : null}
                    </div>
                    {batchCount > 1 ? (
                      <p className="small text-muted mb-0 mt-2">
                        Batch of {batchCount} labels.
                        {phase === "polling" && batchResult
                          ? ` Progress: ${batchResult.completedJobs + batchResult.failedJobs} / ${batchResult.totalJobs}`
                          : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="col-lg-7">
                    {/* 1. Printer */}
                    <section className="mb-4">
                      <h6 className="text-uppercase small text-muted mb-2">1. Printer</h6>
                      <div className="d-flex flex-wrap align-items-start gap-2 mb-2">
                        <div className="flex-grow-1" style={{ minWidth: 220 }}>
                          <label className="visually-hidden" htmlFor="forge-print-printer">
                            Printer
                          </label>
                          <select
                            id="forge-print-printer"
                            className="form-select"
                            value={printerId}
                            disabled={formDisabled || printers.length === 0}
                            onChange={(e) => onPrinterChange(e.target.value)}
                          >
                            {printers.length === 0 ? (
                              <option value="">No printers available</option>
                            ) : (
                              printers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {printerDisplayName(p)}
                                  {p.isDefault ? " (default)" : ""}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                        {selected ? (
                          <div className="d-flex flex-wrap gap-1 pt-1">
                            <span className={`badge ${statusBadgeClass(selected)}`}>
                              {printerStatusLabel(selected)}
                            </span>
                            <span className="badge bg-label-secondary">
                              {printerPathLabel(selected)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        {webBtSupported && canPairBluetooth ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            disabled={pairBusy || formDisabled}
                            onClick={() => void handlePairDirect()}
                          >
                            {pairBusy ? "Pairing…" : "Pair Direct Bluetooth"}
                          </button>
                        ) : null}
                        {selectedBluetoothDisconnected && canPairBluetooth ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-warning"
                            disabled={reconnectBusy || formDisabled}
                            onClick={() => void handleReconnect()}
                          >
                            {reconnectBusy ? "Requesting…" : "Reconnect"}
                          </button>
                        ) : null}
                      </div>
                      {pairMessage ? (
                        <p className="small text-muted mb-0 mt-1">{pairMessage}</p>
                      ) : null}
                      {reconnectMessage ? (
                        <p className="small text-muted mb-0 mt-1">{reconnectMessage}</p>
                      ) : null}
                      {selectedBluetoothDisconnected ? (
                        <p className="small text-warning mb-0 mt-1">
                          {printerDisplayName(selected!)} is disconnected. Reconnect or choose
                          another printer.
                        </p>
                      ) : null}
                    </section>

                    {/* 2. Label stock */}
                    <section className="mb-4">
                      <h6 className="text-uppercase small text-muted mb-2">2. Label stock</h6>
                      <div className="d-flex flex-wrap gap-2 mb-2">
                        {BUILTIN_STOCK.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={`btn btn-sm ${
                              stockId === s.id ? "btn-primary" : "btn-outline-secondary"
                            }`}
                            disabled={formDisabled}
                            onClick={() => applyStockSelection(s.id)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                      {mediaProfiles.length > 0 ? (
                        <div className="mb-0">
                          <label className="form-label small" htmlFor="forge-print-media">
                            Or pick a media profile
                          </label>
                          <select
                            id="forge-print-media"
                            className="form-select form-select-sm"
                            value={mediaProfileId ? `media:${mediaProfileId}` : ""}
                            disabled={formDisabled}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) {
                                applyStockSelection("builtin:4x4");
                                return;
                              }
                              applyStockSelection(v);
                            }}
                          >
                            <option value="">Use preset above</option>
                            {mediaProfiles.map((m) => (
                              <option key={m.id} value={`media:${m.id}`}>
                                {m.name} ({m.widthInches}&times;{m.heightInches} in)
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </section>

                    {/* 3. Copies */}
                    <section className="mb-4">
                      <h6 className="text-uppercase small text-muted mb-2">3. Copies</h6>
                      <label className="form-label small" htmlFor="forge-print-copies">
                        {batchCount > 1 ? "Copies per label" : "How many labels to print"}
                      </label>
                      <div className="input-group" style={{ maxWidth: 220 }}>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={formDisabled || copies <= 1}
                          onClick={() => updateCopies((c) => c - 1)}
                          aria-label="Decrease copies"
                        >
                          −
                        </button>
                        <input
                          id="forge-print-copies"
                          type="number"
                          className="form-control text-center"
                          min={1}
                          max={100}
                          value={copies}
                          disabled={formDisabled}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isFinite(n)) return;
                            updateCopies(n);
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={formDisabled || copies >= 100}
                          onClick={() => updateCopies((c) => c + 1)}
                          aria-label="Increase copies"
                        >
                          +
                        </button>
                      </div>
                      <p className="small text-muted mb-0 mt-1">
                        {batchCount > 1
                          ? `${batchCount} labels × ${copies} = ${batchCount * copies} total prints`
                          : copies === 1
                            ? "Printer will output 1 label."
                            : `Printer will output ${copies} identical labels.`}
                      </p>
                      {batchCount > 1 ? (
                        <div className="d-flex align-items-center gap-2 mt-2">
                          <label
                            className="small text-muted text-nowrap mb-0"
                            htmlFor="forge-print-start-at"
                          >
                            Start at label
                          </label>
                          <input
                            id="forge-print-start-at"
                            type="number"
                            className="form-control form-control-sm"
                            style={{ width: 90 }}
                            min={1}
                            max={batchCount}
                            value={startAt}
                            disabled={formDisabled}
                            onChange={(e) => {
                              const n = Math.floor(Number(e.target.value));
                              setPausedBatch(null);
                              setStartAt(
                                Number.isFinite(n) ? Math.min(Math.max(1, n), batchCount) : 1,
                              );
                            }}
                          />
                          <span className="small text-muted">of {batchCount}</span>
                        </div>
                      ) : null}
                      {batchCount > 1 ? (
                        <div className="form-check mt-2">
                          <input
                            id="forge-print-stop-on-fail"
                            type="checkbox"
                            className="form-check-input"
                            checked={stopOnFail}
                            disabled={formDisabled}
                            onChange={(e) => setStopOnFail(e.target.checked)}
                          />
                          <label className="form-check-label" htmlFor="forge-print-stop-on-fail">
                            Stop on first error
                          </label>
                        </div>
                      ) : null}
                    </section>

                    {/* 4. Content */}
                    <section className="mb-3">
                      <h6 className="text-uppercase small text-muted mb-2">4. Content</h6>
                      {adjustableFieldKeys.length > 0 ? (
                        <div className="d-flex flex-wrap gap-3 mb-3">
                          {adjustableFieldKeys.map((key) => (
                            <div className="form-check" key={key}>
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`forge-print-field-${key}`}
                                checked={includedFields[key] === true}
                                disabled={formDisabled}
                                onChange={(e) =>
                                  setIncludedFields((prev) => ({
                                    ...prev,
                                    [key]: e.target.checked,
                                  }))
                                }
                              />
                              <label
                                className="form-check-label text-capitalize"
                                htmlFor={`forge-print-field-${key}`}
                              >
                                {key === "description"
                                  ? "Enter your own description"
                                  : key.replace(/[_-]+/g, " ")}
                              </label>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="small text-muted">Title and QR are included by default.</p>
                      )}
                      <div className="row g-2">
                        <div className="col-md-6">
                          <label className="form-label small" htmlFor="forge-print-qr-scale">
                            QR size ({qrScalePct}%)
                          </label>
                          <input
                            id="forge-print-qr-scale"
                            type="range"
                            className="form-range"
                            min={50}
                            max={150}
                            step={5}
                            value={qrScalePct}
                            disabled={formDisabled}
                            onChange={(e) => setQrScalePct(Number(e.target.value))}
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label small" htmlFor="forge-print-text-scale">
                            Text size ({textScalePct}%)
                          </label>
                          <input
                            id="forge-print-text-scale"
                            type="range"
                            className="form-range"
                            min={50}
                            max={150}
                            step={5}
                            value={textScalePct}
                            disabled={formDisabled}
                            onChange={(e) => setTextScalePct(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </section>

                    {/* 5. Advanced */}
                    <section>
                      <button
                        type="button"
                        className="btn btn-link btn-sm px-0"
                        disabled={formDisabled}
                        aria-expanded={advancedOpen}
                        onClick={() => setAdvancedOpen((v) => !v)}
                      >
                        {advancedOpen ? "Hide advanced" : "Advanced settings"}
                      </button>
                      {advancedOpen ? (
                        <div className="border rounded p-3 mt-1">
                          <div className="row g-3">
                            <div className="col-md-4">
                              <label className="form-label small" htmlFor="forge-print-orientation">
                                Orientation
                              </label>
                              <select
                                id="forge-print-orientation"
                                className="form-select form-select-sm"
                                value={orientation}
                                disabled={formDisabled}
                                onChange={(e) => setOrientation(e.target.value)}
                              >
                                <option value="AUTO">Auto</option>
                                <option value="PORTRAIT">Portrait</option>
                                <option value="LANDSCAPE">Landscape</option>
                              </select>
                            </div>
                            {selectedSupportsCut ? (
                              <div className="col-md-4">
                                <label className="form-label small" htmlFor="forge-print-cut">
                                  Cut mode
                                </label>
                                <select
                                  id="forge-print-cut"
                                  className="form-select form-select-sm"
                                  value={cutMode}
                                  disabled={formDisabled}
                                  onChange={(e) => setCutMode(e.target.value)}
                                >
                                  <option value="">Printer default</option>
                                  <option value="NONE">No cut</option>
                                  <option value="CUT">Cut after job</option>
                                  <option value="PARTIAL">Partial cut</option>
                                </select>
                              </div>
                            ) : null}
                            <div className="col-md-4">
                              <label className="form-label small" htmlFor="forge-print-dpi">
                                DPI
                              </label>
                              <select
                                id="forge-print-dpi"
                                className="form-select form-select-sm"
                                value={dpi}
                                disabled={formDisabled}
                                onChange={(e) => setDpi(Number(e.target.value))}
                              >
                                <option value={203}>203</option>
                                <option value={300}>300</option>
                                <option value={600}>600</option>
                              </select>
                            </div>
                            <div className="col-md-3">
                              <label className="form-label small" htmlFor="forge-print-width">
                                Width (in)
                              </label>
                              <input
                                id="forge-print-width"
                                type="number"
                                className="form-control form-control-sm"
                                min={0.5}
                                max={12}
                                step={0.25}
                                value={labelWidthIn}
                                disabled={formDisabled}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (!Number.isFinite(n)) return;
                                  onCustomSizeChange(clampDim(n, labelWidthIn), labelHeightIn);
                                }}
                              />
                            </div>
                            <div className="col-md-3">
                              <label className="form-label small" htmlFor="forge-print-height">
                                Height (in)
                              </label>
                              <input
                                id="forge-print-height"
                                type="number"
                                className="form-control form-control-sm"
                                min={0.5}
                                max={12}
                                step={0.25}
                                value={labelHeightIn}
                                disabled={formDisabled}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (!Number.isFinite(n)) return;
                                  onCustomSizeChange(labelWidthIn, clampDim(n, labelHeightIn));
                                }}
                              />
                            </div>
                            {templates.length > 0 ? (
                              <div className="col-md-6">
                                <label className="form-label small" htmlFor="forge-print-template">
                                  Template (optional)
                                </label>
                                <select
                                  id="forge-print-template"
                                  className="form-select form-select-sm"
                                  value={templateId}
                                  disabled={formDisabled}
                                  onChange={(e) => {
                                    const id = e.target.value;
                                    setTemplateId(id);
                                    const t = templates.find((x) => x.id === id);
                                    const ver =
                                      t?.versions?.find((v) => v.version === t.publishedVersion) ??
                                      t?.versions?.[0];
                                    if (ver) {
                                      onCustomSizeChange(ver.widthInches, ver.heightInches);
                                      if (ver.dpi > 0) setDpi(ver.dpi);
                                    }
                                  }}
                                >
                                  <option value="">Field layout (default)</option>
                                  {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name} ({t.code})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </section>
                  </div>
                </div>

                {phase === "submitting" || phase === "polling" ? (
                  <p className="text-muted small mt-3 mb-0">
                    {phase === "submitting"
                      ? "Submitting print job…"
                      : progressText
                        ? progressText
                        : selectedIsDirect
                          ? `Printing via Direct Bluetooth… (${String(job?.status ?? "RENDERING").replace(/_/g, " ")})`
                          : `Waiting for printer bridge… (${String(job?.status ?? "QUEUED").replace(/_/g, " ")})`}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          {!authLoading &&
          canView &&
          (phase === "form" ||
            phase === "submitting" ||
            phase === "polling" ||
            phase === "success") ? (
            <div className="modal-footer">
              {phase === "success" ? (
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={phase === "submitting" || phase === "polling"}
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <div className="d-flex align-items-center gap-2 me-auto ms-2">
                    <span className="small text-muted text-nowrap">
                      {batchCount > 1 ? "Copies / label" : "Copies"}
                    </span>
                    <div className="input-group input-group-sm" style={{ width: 148 }}>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={formDisabled || copies <= 1}
                        onClick={() => updateCopies((c) => c - 1)}
                        aria-label="Decrease copies"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        className="form-control text-center"
                        min={1}
                        max={100}
                        value={copies}
                        disabled={formDisabled}
                        aria-label="Number of copies"
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n)) return;
                          updateCopies(n);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={formDisabled || copies >= 100}
                        onClick={() => updateCopies((c) => c + 1)}
                        aria-label="Increase copies"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                      !canPrint ||
                      !printerId ||
                      phase === "submitting" ||
                      phase === "polling" ||
                      printers.length === 0
                    }
                    onClick={() => void runPrint()}
                  >
                    {printButtonLabel}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
