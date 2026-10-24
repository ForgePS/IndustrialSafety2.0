"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import {
  createMediaProfile,
  createPrintBatch,
  createPrintJob,
  getPrintJobArtifactBytes,
  isDirectBluetoothPrinter,
  listMediaProfiles,
  listPrinters,
  pollPrintBatchUntilTerminal,
  previewPrintJob,
  printerDisplayName,
  registerDirectBluetoothPrinter,
  reportPrintJobStatus,
  waitForArtifactUrl,
  type ForgePrinter,
  type PrinterMediaProfile,
} from "@/lib/print-api";
import {
  detectDirectBradySupplySize,
  ensureDirectBradyConnected,
  isDirectBluetoothSupported,
  pairDirectBradyPrinter,
  printPngViaDirectBluetooth,
  forceReconnectDirectBrady,
  getDirectBradyUpdateStats,
  readDirectBradyPrinterAlert,
  readDirectBradyPrinterSnapshot,
} from "@/lib/direct-brady-bluetooth";

const LAST_PRINTER_KEY = "forge.field.print.lastPrinterId";
const LAST_STOCK_KEY = "forge.field.print.lastStockId";
const LAST_COPIES_KEY = "forge.field.print.lastCopies";
const LAST_CUSTOM_WIDTH_KEY = "forge.field.print.lastCustomWidth";
const LAST_CUSTOM_HEIGHT_KEY = "forge.field.print.lastCustomHeight";
const LAST_CUSTOM_NAME_KEY = "forge.field.print.lastCustomName";
const LOCAL_SIZES_KEY = "forge.field.print.localSizes";

type LocalSavedSize = {
  id: string;
  name: string;
  widthInches: number;
  heightInches: number;
};

/** Direct Bluetooth batch progress, kept so a paused batch can resume at the failed label. */
type DirectBatchRun = {
  batchId: string;
  jobIds: string[];
  nextIndex: number;
  /** Labels skipped via "Start at label", so progress shows the user's numbering. */
  labelOffset: number;
  totalLabels: number;
  copies: number;
  failed: number;
  printer: ForgePrinter;
  /** Printer went quiet with the link still "up"; Resume must rebuild the BLE link. */
  freshLink?: boolean;
};

/** Gives the Brady time to print and report a fault before the next label is sent. */
const DIRECT_BATCH_SETTLE_MS = 1500;
/** Minimum labels with no printer status push before treating the printer as stalled. */
const DIRECT_BATCH_MIN_QUIET_LABELS = 4;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLocalSizes(): LocalSavedSize[] {
  const raw = readLocal(LOCAL_SIZES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const width = Number(row.widthInches);
        const height = Number(row.heightInches);
        const name = typeof row.name === "string" ? row.name.trim() : "";
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (!id || !name || !Number.isFinite(width) || !Number.isFinite(height)) return null;
        return {
          id,
          name,
          widthInches: clampDim(width, 4),
          heightInches: clampDim(height, 4),
        };
      })
      .filter((v): v is LocalSavedSize => Boolean(v))
      .slice(0, 24);
  } catch {
    return [];
  }
}

function writeLocalSizes(items: LocalSavedSize[]): void {
  writeLocal(LOCAL_SIZES_KEY, JSON.stringify(items.slice(0, 24)));
}

function persistCustomDims(width: number, height: number, name?: string): void {
  writeLocal(LAST_CUSTOM_WIDTH_KEY, String(width));
  writeLocal(LAST_CUSTOM_HEIGHT_KEY, String(height));
  if (name != null) writeLocal(LAST_CUSTOM_NAME_KEY, name);
}

/** Always on the label (not toggled). Everything else is opt-in. */
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

/** Prefer these content toggles even when the value is empty. */
const PREFERRED_CONTENT_KEYS = ["id", "status", "description"] as const;

function contentFieldLabel(key: string): string {
  if (key === "description") return "Description";
  if (key === "id") return "ID";
  return key.replace(/[_-]+/g, " ");
}

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

function readLocal(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(key);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

function clampDim(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(12, Math.max(0.5, Math.round(n * 100) / 100));
}

function clampCopies(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

function dimsClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.051;
}

function stockIdFromDims(width: number, height: number): string {
  const hit = BUILTIN_STOCK.find(
    (s) => dimsClose(s.widthInches, width) && dimsClose(s.heightInches, height),
  );
  return hit?.id ?? "builtin:custom";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatDimLabel(n: number): string {
  const v = Math.round(n * 100) / 100;
  if (v % 1 === 0) return String(v);
  return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function shortSizeChipLabel(name: string, widthInches: number, heightInches: number): string {
  const dims = `${formatDimLabel(widthInches)}×${formatDimLabel(heightInches)}`;
  const raw = name.trim();
  if (!raw) return dims;
  // Auto names like "Custom 2.25×2.25 in" — just show dims.
  if (/^custom\s+/i.test(raw) && /\d/.test(raw)) return dims;
  // Name already encodes size (e.g. "Asset Label 2x1") — keep name only.
  if (/\d+\s*[x×]\s*\d+/i.test(raw)) {
    return raw.length > 22 ? `${raw.slice(0, 20)}…` : raw;
  }
  return raw.length > 18 ? `${raw.slice(0, 16)}…` : raw;
}

function sizeKey(width: number, height: number): string {
  return `${Math.round(width * 100) / 100}|${Math.round(height * 100) / 100}`;
}

function scaleFromSlider(pct: number): number {
  const n = Number.isFinite(pct) ? pct : 100;
  return Math.min(1.5, Math.max(0.5, Math.round(n) / 100));
}

export type FieldPrintDialogBatchItem = {
  recordId?: string;
  fieldValues?: Record<string, string>;
  title?: string;
};

export type FieldPrintDialogProps = {
  open: boolean;
  onClose: () => void;
  module?: string;
  recordType?: string;
  recordId?: string;
  fieldValues: Record<string, string>;
  title?: string;
  widthInches?: number;
  heightInches?: number;
  /** When true, show an editable title field (Print Manager standalone). */
  allowTitleEdit?: boolean;
  /** When length > 1, submit via createPrintBatch. */
  items?: FieldPrintDialogBatchItem[] | undefined;
  /** Dialog heading override (e.g. "Print 12 labels"). */
  dialogTitle?: string;
};

export function FieldPrintDialog({
  open,
  onClose,
  module = "EQUIPMENT",
  recordType,
  recordId,
  fieldValues,
  title,
  widthInches = 4,
  heightInches = 4,
  allowTitleEdit = false,
  items,
  dialogTitle,
}: FieldPrintDialogProps) {
  const { hasAnyPermission } = useAuth();
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);
  const canPair = hasAnyPermission([
    "industrial.printer.pair_bluetooth",
    "industrial.printer.manage",
    "industrial.admin",
  ]);
  const canManageMedia = hasAnyPermission(["industrial.printer.manage_media", "industrial.admin"]);
  /** Print operators can create saved sizes (API + device backup). */
  const canSaveMedia = canManageMedia || canPrint;
  const canView = hasAnyPermission([
    "industrial.printer.view",
    "industrial.printer.print",
    "industrial.admin",
  ]);

  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [mediaProfiles, setMediaProfiles] = useState<PrinterMediaProfile[]>([]);
  const [localSizes, setLocalSizes] = useState<LocalSavedSize[]>(() => readLocalSizes());
  const [printerId, setPrinterId] = useState("");
  const [stockId, setStockId] = useState(() => stockIdFromDims(widthInches, heightInches));
  const [labelWidthIn, setLabelWidthIn] = useState(() => clampDim(widthInches, 4));
  const [labelHeightIn, setLabelHeightIn] = useState(() => clampDim(heightInches, 4));
  const [copies, setCopies] = useState(1);
  const [qrScalePct, setQrScalePct] = useState(125);
  const [textScalePct, setTextScalePct] = useState(100);
  const [orientation, setOrientation] = useState("AUTO");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [customName, setCustomName] = useState("");
  const [includedFields, setIncludedFields] = useState<Record<string, boolean>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [webBt, setWebBt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [detectBusy, setDetectBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopOnFail, setStopOnFail] = useState(true);
  const [startAt, setStartAt] = useState(1);
  const [pausedBatch, setPausedBatch] = useState<DirectBatchRun | null>(null);

  const batchItems = useMemo(() => {
    if (items && items.length > 1) return items;
    return null;
  }, [items]);
  const batchCount = batchItems?.length ?? 1;

  useEffect(() => {
    setStartAt(1);
    setPausedBatch(null);
  }, [items]);

  const labelTitle = useMemo(() => {
    if (allowTitleEdit && titleDraft.trim()) return titleDraft.trim();
    return (
      title ||
      fieldValues.title ||
      fieldValues.Title ||
      fieldValues.name ||
      "Print label"
    ).trim();
  }, [allowTitleEdit, titleDraft, title, fieldValues]);

  const fieldValuesFingerprint = useMemo(
    () =>
      Object.entries(fieldValues)
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join("\n"),
    [fieldValues],
  );

  const stableFieldValues = useMemo(() => {
    const next: Record<string, string> = { ...fieldValues };
    // Always offer ID / status / description toggles (default off).
    for (const key of PREFERRED_CONTENT_KEYS) {
      if (!(key in next)) next[key] = "";
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValuesFingerprint]);

  const adjustableFieldKeys = useMemo(() => {
    const keys = Object.keys(stableFieldValues).filter((k) => !RESERVED_FIELD_KEYS.has(k));
    const preferred = PREFERRED_CONTENT_KEYS.filter((k) => keys.includes(k));
    const rest = keys.filter(
      (k) => !PREFERRED_CONTENT_KEYS.includes(k as (typeof PREFERRED_CONTENT_KEYS)[number]),
    );
    return [...preferred, ...rest];
  }, [stableFieldValues]);

  const selected = useMemo(() => printers.find((p) => p.id === printerId), [printers, printerId]);

  const mediaProfileId = stockId.startsWith("media:") ? stockId.slice("media:".length) : "";

  const savedSizeOptions = useMemo(() => {
    type Opt = {
      id: string;
      label: string;
      widthInches: number;
      heightInches: number;
      rank: number;
    };
    const candidates: Opt[] = [];

    for (const m of mediaProfiles) {
      candidates.push({
        id: `media:${m.id}`,
        label: shortSizeChipLabel(m.name, m.widthInches, m.heightInches),
        widthInches: m.widthInches,
        heightInches: m.heightInches,
        // Prefer real names over auto "Custom …"
        rank: /^custom\s+/i.test(m.name.trim()) ? 2 : 1,
      });
    }
    for (const s of localSizes) {
      const id = s.id.startsWith("local:") || s.id.startsWith("media:") ? s.id : `local:${s.id}`;
      candidates.push({
        id,
        label: shortSizeChipLabel(s.name, s.widthInches, s.heightInches),
        widthInches: s.widthInches,
        heightInches: s.heightInches,
        rank: s.id.startsWith("media:") ? 1 : /^custom\s+/i.test(s.name.trim()) ? 3 : 2,
      });
    }

    // One chip per unique size; skip builtins; prefer named team profiles.
    candidates.sort((a, b) => a.rank - b.rank);
    const seen = new Set<string>();
    const unique: Opt[] = [];
    for (const c of candidates) {
      if (
        BUILTIN_STOCK.some(
          (b) =>
            dimsClose(b.widthInches, c.widthInches) && dimsClose(b.heightInches, c.heightInches),
        )
      ) {
        continue;
      }
      const key = sizeKey(c.widthInches, c.heightInches);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(c);
      if (unique.length >= 6) break;
    }
    return unique.map(({ id, label, widthInches, heightInches }) => ({
      id,
      label,
      widthInches,
      heightInches,
    }));
  }, [mediaProfiles, localSizes]);

  const layoutOpts = useMemo(() => {
    const qrScale = scaleFromSlider(qrScalePct);
    const textScale = scaleFromSlider(textScalePct);
    return {
      ...(qrScale !== 1 ? { qrScale } : {}),
      ...(textScale !== 1 ? { textScale } : {}),
    };
  }, [qrScalePct, textScalePct]);

  const applyStockSelection = useCallback(
    (id: string, profiles: PrinterMediaProfile[] = mediaProfiles) => {
      setStockId(id);
      if (id.startsWith("media:")) {
        const profileId = id.slice("media:".length);
        const profile = profiles.find((p) => p.id === profileId);
        if (profile) {
          setLabelWidthIn(clampDim(profile.widthInches, 4));
          setLabelHeightIn(clampDim(profile.heightInches, 4));
          setCustomName(profile.name);
          persistCustomDims(profile.widthInches, profile.heightInches, profile.name);
          writeLocal(LAST_STOCK_KEY, id);
        }
        return;
      }
      if (id.startsWith("local:")) {
        const local = localSizes.find((s) => s.id === id);
        if (local) {
          setStockId(id);
          setLabelWidthIn(local.widthInches);
          setLabelHeightIn(local.heightInches);
          setCustomName(local.name);
          persistCustomDims(local.widthInches, local.heightInches, local.name);
          writeLocal(LAST_STOCK_KEY, id);
        }
        return;
      }
      if (id === "builtin:custom") {
        writeLocal(LAST_STOCK_KEY, "builtin:custom");
        return;
      }
      const builtin = BUILTIN_STOCK.find((s) => s.id === id);
      if (builtin) {
        setLabelWidthIn(builtin.widthInches);
        setLabelHeightIn(builtin.heightInches);
        setCustomName("");
        writeLocal(LAST_STOCK_KEY, id);
      }
    },
    [mediaProfiles, localSizes],
  );

  function setCustomWidth(next: number) {
    const w = clampDim(next, labelWidthIn);
    setLabelWidthIn(w);
    setStockId("builtin:custom");
    persistCustomDims(w, labelHeightIn, customName);
  }

  function setCustomHeight(next: number) {
    const h = clampDim(next, labelHeightIn);
    setLabelHeightIn(h);
    setStockId("builtin:custom");
    persistCustomDims(labelWidthIn, h, customName);
  }

  function applyDetectedSize(width: number, height: number, supplyName?: string) {
    const w = clampDim(width, labelWidthIn);
    const h = clampDim(height, labelHeightIn);
    setLabelWidthIn(w);
    setLabelHeightIn(h);
    const matched = stockIdFromDims(w, h);
    setStockId(matched);
    if (matched === "builtin:custom") {
      if (supplyName) setCustomName(supplyName);
      persistCustomDims(w, h, supplyName ?? customName);
    } else if (matched !== "builtin:custom") {
      setCustomName("");
    }
    return { width: w, height: h };
  }

  function upsertLocalSize(entry: LocalSavedSize) {
    const next = [
      entry,
      ...localSizes.filter(
        (s) =>
          s.id !== entry.id &&
          !(
            dimsClose(s.widthInches, entry.widthInches) &&
            dimsClose(s.heightInches, entry.heightInches)
          ),
      ),
    ].slice(0, 12);
    setLocalSizes(next);
    writeLocalSizes(next);
  }

  async function onSaveCustomSize() {
    if (!canSaveMedia) {
      setError("You need print permission to save a custom size.");
      return;
    }
    const name = customName.trim() || `Custom ${labelWidthIn}×${labelHeightIn} in`;
    setSaveBusy(true);
    setError(null);
    setMessage(null);
    persistCustomDims(labelWidthIn, labelHeightIn, name);
    try {
      const created = await createMediaProfile({
        name,
        widthInches: labelWidthIn,
        heightInches: labelHeightIn,
        dieCut: true,
        continuous: false,
        ...(orientation && orientation !== "AUTO" ? { orientation } : {}),
      });
      const profiles = [created, ...mediaProfiles.filter((p) => p.id !== created.id)];
      setMediaProfiles(profiles);
      setCustomName(created.name);
      setLabelWidthIn(clampDim(created.widthInches, 4));
      setLabelHeightIn(clampDim(created.heightInches, 4));
      setStockId(`media:${created.id}`);
      writeLocal(LAST_STOCK_KEY, `media:${created.id}`);
      upsertLocalSize({
        id: `media:${created.id}`,
        name: created.name,
        widthInches: created.widthInches,
        heightInches: created.heightInches,
      });
      setMessage(`Saved “${created.name}” (${created.widthInches}×${created.heightInches} in).`);
    } catch (err) {
      // API save failed (old API / permission) — keep a device copy so the size isn't lost.
      const localId = `local:${labelWidthIn}x${labelHeightIn}:${name}`;
      upsertLocalSize({
        id: localId,
        name,
        widthInches: labelWidthIn,
        heightInches: labelHeightIn,
      });
      setStockId("builtin:custom");
      setCustomName(name);
      writeLocal(LAST_STOCK_KEY, "builtin:custom");
      setMessage(`Saved “${name}” on this device (${labelWidthIn}×${labelHeightIn} in).`);
      if (err instanceof ApiError && err.status !== 403) {
        setError(`${err.message} (kept on this device)`);
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function onDetectFromPrinter() {
    if (!canPrint) return;
    const directPrinter =
      selected && isDirectBluetoothPrinter(selected)
        ? selected
        : printers.find((p) => isDirectBluetoothPrinter(p));
    if (!directPrinter) {
      setError("Pair a Brady Direct Bluetooth printer first, then tap Detect.");
      return;
    }
    const supported = await isDirectBluetoothSupported();
    if (!supported) {
      setError(
        "Web Bluetooth is not available. Android: Chrome or Edge. iPad: open Field in Bluefy.",
      );
      return;
    }

    setDetectBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (directPrinter.id !== printerId) {
        setPrinterId(directPrinter.id);
        writeLocal(LAST_PRINTER_KEY, directPrinter.id);
      }
      const size = await detectDirectBradySupplySize(directPrinter.bluetoothSavedId);
      const applied = applyDetectedSize(size.widthInches, size.heightInches, size.supplyName);
      writeLocal(LAST_STOCK_KEY, stockIdFromDims(applied.width, applied.height));
      const nameBit = size.supplyName ? ` (${size.supplyName})` : "";
      setMessage(`Detected ${applied.width}×${applied.height} in from printer${nameBit}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read label size from printer.");
    } finally {
      setDetectBusy(false);
    }
  }

  const load = useCallback(async () => {
    if (!canView) return;
    try {
      const [items, profiles] = await Promise.all([
        listPrinters({ enabled: "true" }),
        listMediaProfiles().catch(() => [] as PrinterMediaProfile[]),
      ]);
      const directFirst = [
        ...items.filter((p) => isDirectBluetoothPrinter(p)),
        ...items.filter((p) => !isDirectBluetoothPrinter(p)),
      ];
      setPrinters(directFirst);
      setMediaProfiles(profiles);
      // Collapse device copies that match a team profile or each other.
      const prunedLocals = (() => {
        const raw = readLocalSizes();
        const seen = new Set<string>();
        const next: LocalSavedSize[] = [];
        for (const s of raw) {
          if (
            profiles.some(
              (p) =>
                dimsClose(p.widthInches, s.widthInches) &&
                dimsClose(p.heightInches, s.heightInches),
            )
          ) {
            continue;
          }
          const key = sizeKey(s.widthInches, s.heightInches);
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(s);
        }
        return next.slice(0, 12);
      })();
      setLocalSizes(prunedLocals);
      writeLocalSizes(prunedLocals);

      const lastPrinter = readLocal(LAST_PRINTER_KEY);
      setPrinterId((current) => {
        if (current && directFirst.some((p) => p.id === current)) return current;
        if (lastPrinter && directFirst.some((p) => p.id === lastPrinter)) return lastPrinter;
        const preferred =
          directFirst.find((p) => isDirectBluetoothPrinter(p) && p.isDefault) ??
          directFirst.find((p) => isDirectBluetoothPrinter(p)) ??
          directFirst.find((p) => p.isDefault) ??
          directFirst[0];
        return preferred?.id ?? "";
      });

      const lastStock = readLocal(LAST_STOCK_KEY);
      if (lastStock?.startsWith("media:")) {
        const profileId = lastStock.slice("media:".length);
        const profile = profiles.find((p) => p.id === profileId);
        if (profile) {
          setStockId(lastStock);
          setLabelWidthIn(clampDim(profile.widthInches, 4));
          setLabelHeightIn(clampDim(profile.heightInches, 4));
          setCustomName(profile.name);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load printers.");
    }
  }, [canView]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMessage(null);
    setPreviewUrl(null);
    setShowAdvanced(false);
    void load();
    void isDirectBluetoothSupported().then(setWebBt);

    const lastStock = readLocal(LAST_STOCK_KEY);
    const lastCopies = readLocal(LAST_COPIES_KEY);
    if (lastCopies) setCopies(clampCopies(Number(lastCopies)));

    const savedCustomW = Number(readLocal(LAST_CUSTOM_WIDTH_KEY));
    const savedCustomH = Number(readLocal(LAST_CUSTOM_HEIGHT_KEY));
    const savedCustomName = readLocal(LAST_CUSTOM_NAME_KEY) ?? "";
    const hasSavedCustom =
      Number.isFinite(savedCustomW) &&
      savedCustomW > 0 &&
      Number.isFinite(savedCustomH) &&
      savedCustomH > 0;

    const fromProps = stockIdFromDims(widthInches, heightInches);
    const initialStock =
      lastStock &&
      (lastStock.startsWith("builtin:") ||
        lastStock.startsWith("media:") ||
        lastStock.startsWith("local:"))
        ? lastStock
        : fromProps;

    if (initialStock === "builtin:custom" || initialStock.startsWith("local:")) {
      setStockId("builtin:custom");
      if (hasSavedCustom) {
        setLabelWidthIn(clampDim(savedCustomW, 4));
        setLabelHeightIn(clampDim(savedCustomH, 4));
        if (savedCustomName) setCustomName(savedCustomName);
      } else {
        setLabelWidthIn(clampDim(widthInches, 4));
        setLabelHeightIn(clampDim(heightInches, 4));
      }
      if (initialStock.startsWith("local:")) {
        const local = readLocalSizes().find((s) => s.id === initialStock);
        if (local) {
          setLabelWidthIn(local.widthInches);
          setLabelHeightIn(local.heightInches);
          setCustomName(local.name);
        }
      }
    } else {
      const builtin = BUILTIN_STOCK.find((s) => s.id === initialStock);
      if (builtin) {
        setStockId(builtin.id);
        setLabelWidthIn(builtin.widthInches);
        setLabelHeightIn(builtin.heightInches);
      } else if (initialStock.startsWith("media:")) {
        setStockId(initialStock);
        // Dims applied when profiles finish loading in load().
      } else {
        setStockId(fromProps);
        setLabelWidthIn(clampDim(widthInches, 4));
        setLabelHeightIn(clampDim(heightInches, 4));
      }
    }
    if (allowTitleEdit) {
      setTitleDraft((title || fieldValues.title || fieldValues.name || "").trim() || "Field label");
    }

    // Content fields are opt-in; start unchecked so labels default to title + QR only.
    const defaults: Record<string, boolean> = {};
    for (const k of Object.keys(stableFieldValues)) {
      if (!RESERVED_FIELD_KEYS.has(k)) defaults[k] = false;
    }
    setIncludedFields(defaults);
  }, [
    open,
    load,
    widthInches,
    heightInches,
    allowTitleEdit,
    title,
    fieldValues,
    stableFieldValues,
  ]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function onPair() {
    if (!canPair) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const paired = await pairDirectBradyPrinter();
      const name = paired.name || "Brady Direct Bluetooth";
      const registered = await registerDirectBluetoothPrinter({
        name,
        displayName: name,
        bluetoothSavedId: paired.savedId,
        bluetoothDeviceId: paired.deviceId,
      });
      setMessage(`Paired ${printerDisplayName(registered)}.`);
      await load();
      setPrinterId(registered.id);
      writeLocal(LAST_PRINTER_KEY, registered.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed.");
    } finally {
      setBusy(false);
    }
  }

  function filterFieldValues(
    source: Record<string, string>,
    opts?: { overrideTitle?: string },
  ): Record<string, string> {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(source)) {
      if (v == null || String(v).trim().length === 0) continue;
      if (RESERVED_FIELD_KEYS.has(k)) {
        next[k] = String(v);
        continue;
      }
      if (includedFields[k] === true) next[k] = String(v);
    }
    const titleValue = (
      opts?.overrideTitle ||
      next.title ||
      source.title ||
      source.name ||
      ""
    ).trim();
    if (titleValue) {
      next.title = titleValue;
      if (!next.name) next.name = (source.name || titleValue).trim();
    }
    return next;
  }

  function jobFieldValues(): Record<string, string> {
    return filterFieldValues(stableFieldValues, { overrideTitle: labelTitle });
  }

  function jobExtras() {
    return {
      ...(mediaProfileId && isUuid(mediaProfileId) ? { mediaProfileId } : {}),
      ...(orientation && orientation !== "AUTO" ? { orientation } : {}),
      ...(Object.keys(layoutOpts).length > 0 ? { layout: layoutOpts } : {}),
    };
  }

  async function printDirectJob(
    jobId: string,
    printer: ForgePrinter,
    jobCopies: number,
  ): Promise<{ ok: boolean; message?: string }> {
    try {
      await waitForArtifactUrl(jobId);
      const pngBytes = await getPrintJobArtifactBytes(jobId);
      await printPngViaDirectBluetooth({
        pngBytes,
        copies: jobCopies,
        allowChooser: false,
        ...(printer.bluetoothSavedId ? { savedId: printer.bluetoothSavedId } : {}),
      });
      await reportPrintJobStatus(jobId, { status: "COMPLETED" });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Direct print failed.";
      await reportPrintJobStatus(jobId, {
        status: "FAILED",
        errorCode: "DIRECT_BLUETOOTH_PRINT_FAILED",
        errorMessage: msg,
      }).catch(() => undefined);
      return { ok: false, message: msg };
    }
  }

  async function fetchDirectJobBytes(jobId: string): Promise<Uint8Array> {
    await waitForArtifactUrl(jobId);
    return getPrintJobArtifactBytes(jobId);
  }

  /**
   * Sends batch labels one at a time. Brady i-series printers accept bytes even while
   * faulted (out of labels, jam, cover open) and silently drop them, so the printer's
   * own status is checked around every label and the batch pauses instead of
   * marking the rest printed. Paused jobs stay non-terminal so Resume can reuse them.
   */
  async function runDirectBatch(run: DirectBatchRun): Promise<void> {
    const total = run.jobIds.length;
    let failed = run.failed;

    const pause = (index: number, reason: string, opts?: { freshLink?: boolean }) => {
      const label = run.labelOffset + index + 1;
      setPausedBatch({ ...run, nextIndex: index, failed, freshLink: opts?.freshLink === true });
      setStartAt(label);
      setMessage(null);
      setError(
        `Paused at label ${label} of ${run.totalLabels}. ${reason}` +
          (opts?.freshLink
            ? " Tap Resume to reconnect and reprint from here."
            : " Fix the printer, then tap Resume."),
      );
    };
    const pauseForStall = (index: number) =>
      pause(index, "The Brady stopped responding, so the last few labels may not have printed.", {
        freshLink: true,
      });

    // Stall detection: the printer pushes status while it works. Silence across several
    // labels (longer than any quiet gap seen earlier in this run) means it stopped printing.
    let sawChatter = false;
    let quietStreak = 0;
    let maxHealthyGap = 0;
    let updatesAtSend: number | null = null;
    let lastWindowUpdates: number | null = null;
    /** Closes the window for the label just sent; returns the quiet streak when stalled. */
    const closeQuietWindow = (): number | null => {
      if (updatesAtSend == null) return null;
      const got = getDirectBradyUpdateStats().count - updatesAtSend;
      updatesAtSend = null;
      lastWindowUpdates = got;
      if (got > 0) {
        if (sawChatter) maxHealthyGap = Math.max(maxHealthyGap, quietStreak);
        sawChatter = true;
        quietStreak = 0;
        return null;
      }
      quietStreak += 1;
      const limit = Math.max(DIRECT_BATCH_MIN_QUIET_LABELS, maxHealthyGap * 2 + 1);
      return sawChatter && quietStreak >= limit ? quietStreak : null;
    };

    const baseline = await readDirectBradyPrinterAlert();
    const baselineKey = baseline?.blocking ? baseline.key : null;
    let lastSnapshot = await readDirectBradyPrinterSnapshot().catch(() => null);

    /** Returns a reason to pause, or null when the printer looks able to keep printing. */
    const printerStopReason = async (): Promise<string | null> => {
      const alert = await readDirectBradyPrinterAlert();
      const snap = await readDirectBradyPrinterSnapshot().catch(() => null);
      const prev = lastSnapshot;
      if (snap) lastSnapshot = snap;
      if (alert?.blocking && alert.key !== baselineKey) return alert.text;
      if (snap?.supplyRemainingPct === 0 && (prev?.supplyRemainingPct ?? 0) > 0) {
        return "Printer reports it is out of labels.";
      }
      if (
        snap?.ribbonRemainingPct === 0 &&
        (prev?.ribbonRemainingPct ?? 0) > 0 &&
        snap.directThermal !== true
      ) {
        return "Printer reports it is out of ribbon.";
      }
      return null;
    };

    let prefetched: { jobId: string; bytes: Promise<Uint8Array> } | null = null;
    for (let i = run.nextIndex; i < total; i += 1) {
      const jobId = run.jobIds[i];
      if (!jobId) continue;
      const supplyPct = lastSnapshot?.supplyRemainingPct;
      setMessage(
        `Printing ${run.labelOffset + i + 1} of ${run.totalLabels}…` +
          (supplyPct != null && supplyPct > 0 ? ` (labels ${Math.round(supplyPct)}% left)` : ""),
      );

      const stalled = closeQuietWindow();
      if (stalled) {
        pauseForStall(i - stalled);
        return;
      }
      const before = await printerStopReason();
      if (before) {
        pause(i, before);
        return;
      }

      let bytes: Uint8Array;
      try {
        bytes = await (prefetched?.jobId === jobId ? prefetched.bytes : fetchDirectJobBytes(jobId));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Label render failed.";
        failed += 1;
        await reportPrintJobStatus(jobId, {
          status: "FAILED",
          errorCode: "DIRECT_BLUETOOTH_PRINT_FAILED",
          errorMessage: msg,
        }).catch(() => undefined);
        if (stopOnFail) throw new Error(msg);
        prefetched = null;
        continue;
      }

      const nextId = run.jobIds[i + 1];
      prefetched = nextId ? { jobId: nextId, bytes: fetchDirectJobBytes(nextId) } : null;
      prefetched?.bytes.catch(() => undefined);

      updatesAtSend = getDirectBradyUpdateStats().count;
      try {
        await printPngViaDirectBluetooth({
          pngBytes: bytes,
          copies: run.copies,
          allowChooser: false,
          ...(run.printer.bluetoothSavedId ? { savedId: run.printer.bluetoothSavedId } : {}),
        });
      } catch (err) {
        const alert = await readDirectBradyPrinterAlert().catch(() => null);
        pause(i, alert?.text ?? (err instanceof Error ? err.message : "Label did not send."));
        return;
      }

      await sleepMs(DIRECT_BATCH_SETTLE_MS);
      const after = await printerStopReason();
      if (after) {
        pause(i, after);
        return;
      }
      await reportPrintJobStatus(jobId, {
        status: "COMPLETED",
        metadata: {
          label: run.labelOffset + i + 1,
          totalLabels: run.totalLabels,
          printer: lastSnapshot,
          printerUpdatesPrevLabel: lastWindowUpdates,
          printerUpdateKeys: getDirectBradyUpdateStats().lastKeys,
        },
      }).catch(() => undefined);
    }

    if (updatesAtSend != null) {
      await sleepMs(2500);
      const stalled = closeQuietWindow();
      if (stalled) {
        pauseForStall(total - stalled);
        return;
      }
    }

    setPausedBatch(null);
    setStartAt(1);
    const sent = total - failed;
    if (failed > 0 && sent <= 0) throw new Error("All batch labels failed.");
    const range = run.labelOffset > 0 ? ` (${run.labelOffset + 1}–${run.labelOffset + total})` : "";
    setMessage(
      failed > 0
        ? `Printed ${sent} of ${total} labels${range} (${failed} failed).`
        : `Printed ${total} labels${range}.`,
    );
  }

  async function onResumeBatch() {
    if (!pausedBatch) return;
    const run = pausedBatch;
    setBusy(true);
    setError(null);
    try {
      setMessage("Select Brady printer…");
      if (run.freshLink) {
        await forceReconnectDirectBrady(run.printer.bluetoothSavedId);
      } else {
        await ensureDirectBradyConnected(run.printer.bluetoothSavedId, { settle: false });
      }
      await runDirectBatch({ ...run, freshLink: false });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Print failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    if (!canPrint) return;
    setPreviewBusy(true);
    setError(null);
    setMessage(null);
    try {
      const preview = await previewPrintJob({
        widthInches: labelWidthIn,
        heightInches: labelHeightIn,
        fieldValues: jobFieldValues(),
        ...(module ? { module } : {}),
        ...jobExtras(),
      });
      setPreviewUrl(preview.previewDataUrl || `data:image/png;base64,${preview.base64}`);
      setMessage(
        batchCount > 1 ? `Preview updated (first of ${batchCount} labels).` : "Preview updated.",
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Preview failed.",
      );
    } finally {
      setPreviewBusy(false);
    }
  }

  async function onPrint() {
    if (!canPrint || !selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const direct = isDirectBluetoothPrinter(selected);
      if (direct) {
        const supported = await isDirectBluetoothSupported();
        if (!supported) {
          throw new Error(
            "Web Bluetooth is not available. Android tablets: use Chrome or Edge. iPad: open this page in the Bluefy browser.",
          );
        }
      }

      writeLocal(LAST_PRINTER_KEY, selected.id);
      writeLocal(LAST_STOCK_KEY, stockId);
      writeLocal(LAST_COPIES_KEY, String(copies));
      if (stockId === "builtin:custom" || stockId.startsWith("local:")) {
        persistCustomDims(labelWidthIn, labelHeightIn, customName);
      }

      if (direct) {
        // One BLE chooser on this Print tap only. Later steps must not reopen it.
        setMessage("Select Brady printer…");
        await ensureDirectBradyConnected(selected.bluetoothSavedId, { settle: false });
        setMessage("Preparing label…");
      }

      if (batchItems) {
        setPausedBatch(null);
        const firstLabel = Math.min(Math.max(1, Math.floor(startAt) || 1), batchItems.length);
        const runItems = batchItems.slice(firstLabel - 1);
        const batch = await createPrintBatch({
          printerId: selected.id,
          copiesPerItem: copies,
          widthInches: labelWidthIn,
          heightInches: labelHeightIn,
          printMode: direct ? "DIRECT_BLUETOOTH" : "BRIDGE",
          stopOnFail,
          items: runItems.map((item) => {
            const raw = item.fieldValues ?? stableFieldValues;
            const filtered = filterFieldValues(raw, {
              ...(item.title ? { overrideTitle: item.title } : {}),
            });
            return {
              ...(module ? { module } : {}),
              ...(recordType ? { recordType } : {}),
              ...(item.recordId && isUuid(item.recordId) ? { recordId: item.recordId } : {}),
              ...(item.title ? { title: item.title } : {}),
              fieldValues: filtered,
            };
          }),
          ...jobExtras(),
        });

        if (direct) {
          await runDirectBatch({
            batchId: batch.id,
            jobIds: (batch.jobs ?? []).map((j) => j.id),
            nextIndex: 0,
            labelOffset: firstLabel - 1,
            totalLabels: batchItems.length,
            copies,
            failed: 0,
            printer: selected,
          });
          return;
        }

        setMessage(`Batch queued (${batch.totalJobs} labels)…`);
        const finalBatch = await pollPrintBatchUntilTerminal(batch.id);
        const status = String(finalBatch.status ?? "").toUpperCase();
        if (status === "FAILED") {
          throw new Error(`${finalBatch.failedJobs} of ${finalBatch.totalJobs} labels failed.`);
        }
        setMessage(
          status === "PARTIAL"
            ? `Printed ${finalBatch.completedJobs} of ${finalBatch.totalJobs} labels (${finalBatch.failedJobs} failed).`
            : `Printed ${finalBatch.totalJobs} labels.`,
        );
        return;
      }

      const created = await createPrintJob({
        printerId: selected.id,
        copies,
        widthInches: labelWidthIn,
        heightInches: labelHeightIn,
        printMode: direct ? "DIRECT_BLUETOOTH" : "BRIDGE",
        fieldValues: jobFieldValues(),
        ...(module ? { module } : {}),
        ...(recordType ? { recordType } : {}),
        ...(recordId && isUuid(recordId) ? { recordId } : {}),
        ...(labelTitle ? { title: labelTitle } : {}),
        ...jobExtras(),
      });

      if (direct) {
        const result = await printDirectJob(created.id, selected, copies);
        if (!result.ok) throw new Error(result.message ?? "Direct print failed.");
        setMessage(copies === 1 ? "Label printed." : `${copies} labels printed.`);
        return;
      }

      setMessage(`Print job ${created.id.slice(0, 8)}… queued for bridge (${created.status}).`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Print failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function bumpWidth(delta: number) {
    setCustomWidth(Math.round((labelWidthIn + delta) * 100) / 100);
  }

  function bumpHeight(delta: number) {
    setCustomHeight(Math.round((labelHeightIn + delta) * 100) / 100);
  }

  if (!open) return null;
  if (!canView && !canPrint) return null;

  const formDisabled = busy || previewBusy || saveBusy || detectBusy;
  const sizeLabel = `${formatDimLabel(labelWidthIn)}×${formatDimLabel(labelHeightIn)} in`;
  const heading =
    dialogTitle?.trim() || (batchCount > 1 ? `Print ${batchCount} labels` : "Print label");
  const printButtonLabel = busy
    ? batchCount > 1
      ? "Printing…"
      : "Printing…"
    : batchCount > 1
      ? `Print ${Math.max(1, batchCount - startAt + 1)}`
      : copies > 1
        ? `Print ${copies}`
        : "Print";

  return (
    <div
      className="ff-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!formDisabled) onClose();
      }}
    >
      <div
        className="ff-modal ff-modal--print"
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-print-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ff-modal__head">
          <h2 className="ff-modal__title" id="field-print-dialog-title">
            {heading}
          </h2>
          <button
            type="button"
            className="ff-btn ff-btn-secondary ff-modal__close"
            disabled={formDisabled}
            onClick={onClose}
          >
            Close
          </button>
        </header>

        {canPrint ? (
          <div className="ff-size-panel" aria-label="Label size">
            <div className="ff-size-panel__readout" aria-live="polite">
              <span className="ff-size-panel__readout-label">Size</span>
              <strong className="ff-size-panel__readout-value">{sizeLabel}</strong>
              {stockId === "builtin:custom" || stockId.startsWith("local:") ? (
                <span className="ff-chip ff-chip--info">Custom</span>
              ) : stockId.startsWith("media:") || savedSizeOptions.some((s) => s.id === stockId) ? (
                <span className="ff-chip ff-chip--info">Saved</span>
              ) : null}
            </div>

            <div className="ff-stock-grid" role="group" aria-label="Label stock presets">
              {BUILTIN_STOCK.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`ff-stock-chip${stockId === s.id ? " is-active" : ""}`}
                  disabled={formDisabled}
                  onClick={() => applyStockSelection(s.id)}
                >
                  {s.label}
                </button>
              ))}
              {savedSizeOptions.map((s) => {
                const active =
                  stockId === s.id ||
                  ((stockId === "builtin:custom" || stockId.startsWith("local:")) &&
                    dimsClose(labelWidthIn, s.widthInches) &&
                    dimsClose(labelHeightIn, s.heightInches));
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`ff-stock-chip${active ? " is-active" : ""}`}
                    disabled={formDisabled}
                    title={`${s.widthInches}×${s.heightInches} in`}
                    onClick={() => applyStockSelection(s.id)}
                  >
                    {s.label}
                  </button>
                );
              })}
              <button
                type="button"
                className={`ff-stock-chip${
                  stockId === "builtin:custom" &&
                  !savedSizeOptions.some(
                    (s) =>
                      dimsClose(labelWidthIn, s.widthInches) &&
                      dimsClose(labelHeightIn, s.heightInches),
                  )
                    ? " is-active"
                    : ""
                }`}
                disabled={formDisabled}
                onClick={() => applyStockSelection("builtin:custom")}
              >
                Custom
              </button>
            </div>

            <div className="ff-dim-controls">
              <div className="ff-dim-control">
                <span className="ff-label" id="field-print-width-label">
                  Width (in)
                </span>
                <div
                  className="ff-stepper ff-stepper--size"
                  role="group"
                  aria-labelledby="field-print-width-label"
                >
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    disabled={formDisabled || labelWidthIn <= 0.5}
                    onClick={() => bumpWidth(-0.25)}
                    aria-label="Decrease width"
                  >
                    −
                  </button>
                  <input
                    id="field-print-width"
                    className="ff-input ff-stepper__input"
                    type="number"
                    min={0.5}
                    max={12}
                    step={0.25}
                    inputMode="decimal"
                    value={labelWidthIn}
                    disabled={formDisabled}
                    onFocus={(e) => {
                      e.currentTarget.select();
                      e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
                    }}
                    onChange={(e) => setCustomWidth(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    disabled={formDisabled || labelWidthIn >= 12}
                    onClick={() => bumpWidth(0.25)}
                    aria-label="Increase width"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="ff-dim-control">
                <span className="ff-label" id="field-print-height-label">
                  Height (in)
                </span>
                <div
                  className="ff-stepper ff-stepper--size"
                  role="group"
                  aria-labelledby="field-print-height-label"
                >
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    disabled={formDisabled || labelHeightIn <= 0.5}
                    onClick={() => bumpHeight(-0.25)}
                    aria-label="Decrease height"
                  >
                    −
                  </button>
                  <input
                    id="field-print-height"
                    className="ff-input ff-stepper__input"
                    type="number"
                    min={0.5}
                    max={12}
                    step={0.25}
                    inputMode="decimal"
                    value={labelHeightIn}
                    disabled={formDisabled}
                    onFocus={(e) => {
                      e.currentTarget.select();
                      e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
                    }}
                    onChange={(e) => setCustomHeight(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    disabled={formDisabled || labelHeightIn >= 12}
                    onClick={() => bumpHeight(0.25)}
                    aria-label="Increase height"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {webBt ? (
              <button
                type="button"
                className="ff-btn ff-btn-secondary ff-size-panel__detect"
                disabled={formDisabled}
                onClick={() => void onDetectFromPrinter()}
              >
                {detectBusy ? "Reading printer…" : "Detect from printer"}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="ff-modal__body">
          {!canPrint ? (
            <p className="ff-page-body">You need printer permission to print labels.</p>
          ) : (
            <>
              <label className="ff-label" htmlFor="field-print-printer">
                Printer
              </label>
              <select
                id="field-print-printer"
                className="ff-input"
                value={printerId}
                disabled={formDisabled || printers.length === 0}
                onChange={(e) => {
                  setPrinterId(e.target.value);
                  writeLocal(LAST_PRINTER_KEY, e.target.value);
                }}
              >
                {printers.length === 0 ? (
                  <option value="">No printers</option>
                ) : (
                  printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {printerDisplayName(p)}
                      {isDirectBluetoothPrinter(p) ? " · Direct BT" : ""}
                    </option>
                  ))
                )}
              </select>
              <p className="ff-meta">
                If the Brady does not appear after a rename, set its Bluetooth name so it still
                starts with the model (example: i4311-ShopFloor), then tap Re-pair.
              </p>

              {allowTitleEdit ? (
                <>
                  <label className="ff-label" htmlFor="field-print-title">
                    Label title
                  </label>
                  <input
                    id="field-print-title"
                    className="ff-input"
                    value={titleDraft}
                    disabled={formDisabled}
                    onFocus={(e) =>
                      e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })
                    }
                    onChange={(e) => setTitleDraft(e.target.value)}
                    placeholder="Title printed on the label"
                  />
                </>
              ) : null}

              <p className="ff-label">Content</p>
              <p className="ff-meta">Title and QR print by default. Turn on extra fields below.</p>
              <div className="ff-content-toggles" role="group" aria-label="Optional label fields">
                {adjustableFieldKeys.map((key) => (
                  <label key={key} className="ff-check-row">
                    <input
                      type="checkbox"
                      checked={includedFields[key] === true}
                      disabled={formDisabled}
                      onChange={(e) =>
                        setIncludedFields((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                    />
                    <span>{contentFieldLabel(key)}</span>
                  </label>
                ))}
              </div>

              {stockId === "builtin:custom" || stockId.startsWith("local:") ? (
                <div className="ff-print-advanced">
                  <label className="ff-label" htmlFor="field-print-custom-name">
                    Custom size name
                  </label>
                  <input
                    id="field-print-custom-name"
                    className="ff-input"
                    value={customName}
                    disabled={formDisabled}
                    onFocus={(e) =>
                      e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })
                    }
                    onChange={(e) => {
                      setCustomName(e.target.value);
                      if (stockId !== "builtin:custom" && !stockId.startsWith("local:")) {
                        setStockId("builtin:custom");
                      }
                      persistCustomDims(labelWidthIn, labelHeightIn, e.target.value);
                    }}
                    placeholder={sizeLabel}
                  />
                  {canSaveMedia ? (
                    <button
                      type="button"
                      className="ff-btn ff-btn-secondary"
                      disabled={formDisabled}
                      onClick={() => void onSaveCustomSize()}
                    >
                      {saveBusy ? "Saving…" : "Save size"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <label className="ff-label" htmlFor="field-print-copies">
                Copies
              </label>
              <div className="ff-stepper">
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary"
                  disabled={formDisabled || copies <= 1}
                  onClick={() => setCopies((c) => clampCopies(c - 1))}
                  aria-label="Decrease copies"
                >
                  −
                </button>
                <input
                  id="field-print-copies"
                  className="ff-input ff-stepper__input"
                  type="number"
                  min={1}
                  max={100}
                  value={copies}
                  disabled={formDisabled}
                  onChange={(e) => setCopies(clampCopies(Number(e.target.value)))}
                />
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary"
                  disabled={formDisabled || copies >= 100}
                  onClick={() => setCopies((c) => clampCopies(c + 1))}
                  aria-label="Increase copies"
                >
                  +
                </button>
              </div>

              {batchCount > 1 ? (
                <>
                  <label className="ff-label" htmlFor="field-print-start-at">
                    Start at label (of {batchCount})
                  </label>
                  <input
                    id="field-print-start-at"
                    className="ff-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={batchCount}
                    value={startAt}
                    disabled={formDisabled}
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      setPausedBatch(null);
                      setStartAt(Number.isFinite(n) ? Math.min(Math.max(1, n), batchCount) : 1);
                    }}
                  />
                  <label className="ff-check-row" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={stopOnFail}
                      disabled={formDisabled}
                      onChange={(e) => setStopOnFail(e.target.checked)}
                    />
                    <span>Stop batch if a label fails</span>
                  </label>
                </>
              ) : null}

              <label className="ff-label" htmlFor="field-print-qr-scale">
                QR size ({qrScalePct}%)
              </label>
              <input
                id="field-print-qr-scale"
                className="ff-range"
                type="range"
                min={50}
                max={150}
                step={5}
                value={qrScalePct}
                disabled={formDisabled}
                onChange={(e) => setQrScalePct(Number(e.target.value))}
              />

              <label className="ff-label" htmlFor="field-print-text-scale">
                Text size ({textScalePct}%)
              </label>
              <input
                id="field-print-text-scale"
                className="ff-range"
                type="range"
                min={50}
                max={150}
                step={5}
                value={textScalePct}
                disabled={formDisabled}
                onChange={(e) => setTextScalePct(Number(e.target.value))}
              />

              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                disabled={formDisabled}
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Hide advanced" : "Advanced options"}
              </button>

              {showAdvanced ? (
                <div className="ff-print-advanced">
                  <label className="ff-label" htmlFor="field-print-orientation">
                    Orientation
                  </label>
                  <select
                    id="field-print-orientation"
                    className="ff-input"
                    value={orientation}
                    disabled={formDisabled}
                    onChange={(e) => setOrientation(e.target.value)}
                  >
                    <option value="AUTO">Auto</option>
                    <option value="PORTRAIT">Portrait</option>
                    <option value="LANDSCAPE">Landscape</option>
                  </select>
                </div>
              ) : null}

              {previewUrl ? (
                <div className="ff-print-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Label preview" />
                </div>
              ) : null}

              {message ? <p className="ff-meta">{message}</p> : null}
              {error ? (
                <p className="ff-page-body" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        {canPrint ? (
          <footer className="ff-modal__foot">
            {webBt && canPair ? (
              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                disabled={formDisabled}
                onClick={() => void onPair()}
              >
                {busy ? "Working…" : "Re-pair"}
              </button>
            ) : null}
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              disabled={formDisabled}
              onClick={() => void onPreview()}
            >
              {previewBusy ? "Preview…" : "Preview"}
            </button>
            {pausedBatch && !busy ? (
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                disabled={formDisabled}
                onClick={() => void onResumeBatch()}
              >
                {`Resume at ${pausedBatch.labelOffset + pausedBatch.nextIndex + 1}`}
              </button>
            ) : (
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                disabled={formDisabled || !printerId}
                onClick={() => void onPrint()}
              >
                {printButtonLabel}
              </button>
            )}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export type FieldPrintButtonProps = {
  module?: string;
  recordType?: string;
  recordId?: string;
  fieldValues: Record<string, string>;
  title?: string;
  widthInches?: number;
  heightInches?: number;
  allowTitleEdit?: boolean;
  items?: FieldPrintDialogBatchItem[];
  dialogTitle?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
};

/** Opens the Print label popup — use this on procedures instead of an inline form. */
export function FieldPrintButton({
  module = "EQUIPMENT",
  recordType,
  recordId,
  fieldValues,
  title,
  widthInches = 4,
  heightInches = 4,
  allowTitleEdit = false,
  items,
  dialogTitle,
  label = "Print Label",
  className = "ff-btn ff-btn-primary",
  disabled = false,
}: FieldPrintButtonProps) {
  const { hasAnyPermission, loading: authLoading } = useAuth();
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);
  const [open, setOpen] = useState(false);

  if (authLoading || !canPrint) return null;

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={(ev) => {
          ev.stopPropagation();
          setOpen(true);
        }}
      >
        {label}
      </button>
      <FieldPrintDialog
        open={open}
        onClose={() => setOpen(false)}
        module={module}
        fieldValues={fieldValues}
        widthInches={widthInches}
        heightInches={heightInches}
        allowTitleEdit={allowTitleEdit}
        {...(recordType ? { recordType } : {})}
        {...(recordId ? { recordId } : {})}
        {...(title ? { title } : {})}
        {...(items && items.length > 1 ? { items } : {})}
        {...(dialogTitle ? { dialogTitle } : {})}
      />
    </>
  );
}

/** @deprecated Prefer FieldPrintButton — kept for existing imports. */
export function FieldPrintLabel(props: FieldPrintButtonProps) {
  return <FieldPrintButton {...props} />;
}
