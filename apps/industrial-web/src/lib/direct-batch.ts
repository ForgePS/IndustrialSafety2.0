/**
 * Direct Bluetooth batch runner.
 *
 * Brady i-series printers accept label bytes even while faulted and silently drop them,
 * and the i4311 stops printing (no error, still "Connected") after roughly 20 separate
 * jobs in a session. So labels are sent as multi-page jobs, the printer's own status is
 * checked around every job, and the batch pauses instead of marking the rest printed.
 * Paused jobs stay non-terminal so Resume can reuse them.
 */
"use client";

import {
  getPrintJobArtifactBytes,
  reportPrintJobStatus,
  type ForgePrinter,
} from "@/lib/print-api";
import { waitForArtifactUrl } from "@/lib/direct-print";
import {
  printPngsAsOneJobViaDirectBluetooth,
  readDirectBradyPrinterAlert,
  readDirectBradyPrinterSnapshot,
} from "@/lib/direct-brady-bluetooth";

export type DirectBatchRun = {
  batchId: string;
  jobIds: string[];
  nextIndex: number;
  /** Labels skipped via "Start at label", so progress shows the user's numbering. */
  labelOffset: number;
  totalLabels: number;
  copies: number;
  failed: number;
  printer: Pick<ForgePrinter, "id" | "bluetoothSavedId">;
};

export type DirectBatchOutcome =
  | { kind: "done"; sent: number; failed: number; total: number }
  | { kind: "paused"; run: DirectBatchRun; label: number; message: string };

/** Labels per Brady print job; keeps a 200-label batch to ~20 jobs. */
const LABELS_PER_JOB = 10;
/** Gives the Brady time to start printing and report a fault before the next job. */
const SETTLE_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJobBytes(jobId: string): Promise<Uint8Array> {
  await waitForArtifactUrl(jobId);
  return getPrintJobArtifactBytes(jobId);
}

type FetchedChunk = { ids: string[]; bytes: Uint8Array[]; failures: { id: string; msg: string }[] };

async function fetchChunk(ids: string[]): Promise<FetchedChunk> {
  const results = await Promise.allSettled(ids.map((id) => fetchJobBytes(id)));
  const out: FetchedChunk = { ids: [], bytes: [], failures: [] };
  results.forEach((r, idx) => {
    const id = ids[idx]!;
    if (r.status === "fulfilled") {
      out.ids.push(id);
      out.bytes.push(r.value);
    } else {
      out.failures.push({
        id,
        msg: r.reason instanceof Error ? r.reason.message : "Label render failed.",
      });
    }
  });
  return out;
}

export async function runDirectBatch(
  run: DirectBatchRun,
  opts: {
    stopOnFail: boolean;
    signal?: AbortSignal;
    onProgress: (text: string) => void;
  },
): Promise<DirectBatchOutcome> {
  const total = run.jobIds.length;
  let failed = run.failed;

  const pause = (index: number, reason: string): DirectBatchOutcome => {
    const label = run.labelOffset + index + 1;
    return {
      kind: "paused",
      run: { ...run, nextIndex: index, failed },
      label,
      message: `Paused at label ${label} of ${run.totalLabels}. ${reason} Fix the printer, then click Resume.`,
    };
  };

  const baseline = await readDirectBradyPrinterAlert();
  const baselineKey = baseline?.blocking ? baseline.key : null;
  let lastSnapshot = await readDirectBradyPrinterSnapshot().catch(() => null);

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

  const chunkIds = (start: number) => run.jobIds.slice(start, start + LABELS_PER_JOB);

  let prefetched: { start: number; chunk: Promise<FetchedChunk> } | null = null;
  for (let start = run.nextIndex; start < total; start += LABELS_PER_JOB) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ids = chunkIds(start);
    const first = run.labelOffset + start + 1;
    const last = run.labelOffset + start + ids.length;
    const supplyPct = lastSnapshot?.supplyRemainingPct;
    opts.onProgress(
      `Printing labels ${first}–${last} of ${run.totalLabels}…` +
        (supplyPct != null && supplyPct > 0 ? ` (labels ${Math.round(supplyPct)}% left)` : ""),
    );

    const before = await printerStopReason();
    if (before) return pause(start, before);

    const chunk = await (prefetched?.start === start ? prefetched.chunk : fetchChunk(ids));
    for (const f of chunk.failures) {
      failed += 1;
      await reportPrintJobStatus(f.id, {
        status: "FAILED",
        errorCode: "DIRECT_BLUETOOTH_PRINT_FAILED",
        errorMessage: f.msg,
      }).catch(() => undefined);
    }
    if (chunk.failures.length && opts.stopOnFail) {
      throw new Error(chunk.failures[0]!.msg);
    }

    const nextStart = start + LABELS_PER_JOB;
    prefetched = nextStart < total ? { start: nextStart, chunk: fetchChunk(chunkIds(nextStart)) } : null;

    if (chunk.bytes.length) {
      try {
        await printPngsAsOneJobViaDirectBluetooth({ pngs: chunk.bytes, copies: run.copies });
      } catch (err) {
        const alert = await readDirectBradyPrinterAlert().catch(() => null);
        return pause(start, alert?.text ?? (err instanceof Error ? err.message : "Labels did not send."));
      }

      await sleep(SETTLE_MS);
      const after = await printerStopReason();
      if (after) return pause(start, after);

      await Promise.all(
        chunk.ids.map((id) =>
          reportPrintJobStatus(id, {
            status: "COMPLETED",
            metadata: {
              label: run.labelOffset + run.jobIds.indexOf(id) + 1,
              totalLabels: run.totalLabels,
              labelsInPrinterJob: chunk.ids.length,
              printer: lastSnapshot,
            },
          }).catch(() => undefined),
        ),
      );
    }
  }

  const sent = total - failed;
  if (failed > 0 && sent <= 0) throw new Error("All batch labels failed.");
  return { kind: "done", sent, failed, total };
}
