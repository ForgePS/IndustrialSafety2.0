import { ApiError, apiSend } from "@forge/web-kit";
import {
  flushOfflineQueue,
  getOfflineScope,
  offlineSend,
  pendingOfflineCount,
} from "@/lib/offline";

export const SANITATION_DOMAIN = "industrial.sanitation";

const DRAFT_PREFIX = "forge.field.sanitation.draft.";
const QUEUE_KEY = "forge.field.sanitation.queue";

export type SanitationAnswer = "PASS" | "FAIL" | "NA" | "YES" | "NO" | "";

export type SanitationResponsePhoto = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
  originalDataUrl?: string;
  hasMarkup?: boolean;
  markupDocument?: unknown;
};

export type SanitationResponseEntry = {
  result: SanitationAnswer;
  notes?: string;
  /** @deprecated Prefer photos[] */
  photoDataUrl?: string;
  photos?: SanitationResponsePhoto[];
  label?: string;
  severity?: string;
  dustDepth?: string;
  dustUnit?: "INCHES" | "MM";
};

export type SanitationDraft = {
  inspectionId: string;
  offlineClientId: string;
  templateId: string;
  templateName: string;
  siteId: string;
  title: string;
  questions: SanitationQuestion[];
  responses: Record<string, SanitationResponseEntry>;
  index: number;
  savedAt: string;
};

export type SanitationQuestion = {
  id: string;
  label: string;
  description?: string;
  section?: string;
  severity?: string;
  regulationRef?: string;
  photoRequired?: boolean;
  measurementRequired?: boolean;
};

export function isSanitationAnswered(result: string | undefined | null): boolean {
  const r = String(result ?? "").toUpperCase();
  return r === "PASS" || r === "FAIL" || r === "NA" || r === "YES" || r === "NO" || r === "N/A";
}

export function isSanitationNo(result: string | undefined | null): boolean {
  const r = String(result ?? "").toUpperCase();
  return r === "FAIL" || r === "NO";
}

export function isSanitationYes(result: string | undefined | null): boolean {
  const r = String(result ?? "").toUpperCase();
  return r === "PASS" || r === "YES";
}

export type SanitationQueueItem = {
  id: string;
  method: "POST" | "PATCH" | "PUT";
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
  /** When set, flush remaps this offline client id to the server inspection id. */
  offlineClientId?: string;
};

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveSanitationDraft(draft: SanitationDraft): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(
      `${DRAFT_PREFIX}${draft.inspectionId}`,
      JSON.stringify({ ...draft, savedAt: new Date().toISOString(), domain: SANITATION_DOMAIN }),
    );
  } catch {
    // ignore quota
  }
}

export function loadSanitationDraft(inspectionId: string): SanitationDraft | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(`${DRAFT_PREFIX}${inspectionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SanitationDraft;
    if (!parsed?.inspectionId || !Array.isArray(parsed.questions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSanitationDraft(inspectionId: string): void {
  const s = store();
  if (!s) return;
  s.removeItem(`${DRAFT_PREFIX}${inspectionId}`);
}

export function readSanitationQueue(): SanitationQueueItem[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SanitationQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSanitationQueue(items: SanitationQueueItem[]): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota
  }
}

export function sanitationPendingCount(): number {
  if (getOfflineScope()) return pendingOfflineCount();
  return readSanitationQueue().length;
}

export function enqueueSanitationMutation(
  method: SanitationQueueItem["method"],
  path: string,
  body: Record<string, unknown>,
  offlineClientId?: string,
): SanitationQueueItem {
  const item: SanitationQueueItem = {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `san-${Date.now()}`,
    method,
    path,
    body,
    createdAt: new Date().toISOString(),
    ...(offlineClientId ? { offlineClientId } : {}),
  };
  const next = [...readSanitationQueue(), item];
  writeSanitationQueue(next);
  return item;
}

/**
 * Flush queued sanitation mutations via the shared offline engine.
 * Falls back to a no-op remaining count when auth scope is not ready yet.
 */
export async function flushSanitationQueue(): Promise<{ flushed: number; remaining: number }> {
  const result = await flushOfflineQueue();
  return { flushed: result.flushed, remaining: result.remaining };
}

/**
 * Send immediately when online; otherwise enqueue for later flush.
 * Duplicate offlineClientId / conflict responses are treated as success.
 */
export async function sanitationSend<T = Record<string, unknown>>(
  path: string,
  method: SanitationQueueItem["method"],
  body: Record<string, unknown>,
  opts?: { offlineClientId?: string; forceQueue?: boolean },
): Promise<{ queued: boolean; data?: T }> {
  // Prefer shared engine when scoped; otherwise keep legacy queue until shell sets scope.
  if (getOfflineScope()) {
    return offlineSend<T>(SANITATION_DOMAIN, path, method, body, {
      ...(opts?.offlineClientId ? { offlineClientId: opts.offlineClientId } : {}),
      ...(opts?.forceQueue ? { forceQueue: opts.forceQueue } : {}),
      operation: method === "POST" ? "create" : "update",
    });
  }

  const offline = opts?.forceQueue || (typeof navigator !== "undefined" && !navigator.onLine);

  if (offline) {
    enqueueSanitationMutation(method, path, body, opts?.offlineClientId);
    return { queued: true };
  }

  try {
    const data = await apiSend<T>(path, method, body);
    return { queued: false, data };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 409 || err.status === 412)) {
      return { queued: false };
    }
    if (err instanceof ApiError && err.status === 0) {
      enqueueSanitationMutation(method, path, body, opts?.offlineClientId);
      return { queued: true };
    }
    if (err instanceof TypeError) {
      enqueueSanitationMutation(method, path, body, opts?.offlineClientId);
      return { queued: true };
    }
    throw err;
  }
}

export function questionsFromTemplateJson(templateJson: unknown): SanitationQuestion[] {
  const root =
    templateJson && typeof templateJson === "object" && !Array.isArray(templateJson)
      ? (templateJson as Record<string, unknown>)
      : null;
  const sections = Array.isArray(root?.sections) ? root!.sections : [];
  const out: SanitationQuestion[] = [];
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const s = section as Record<string, unknown>;
    const sectionTitle = typeof s.title === "string" ? s.title : undefined;
    const questions = Array.isArray(s.questions) ? s.questions : [];
    for (const q of questions) {
      if (!q || typeof q !== "object") continue;
      const row = q as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const label = typeof row.label === "string" ? row.label : "";
      if (!id || !label) continue;
      out.push({
        id,
        label,
        ...(typeof row.description === "string" && row.description.trim()
          ? { description: row.description.trim() }
          : {}),
        ...(sectionTitle ? { section: sectionTitle } : {}),
        ...(typeof row.riskLevel === "string" ? { severity: row.riskLevel } : {}),
        ...(typeof row.regulationRef === "string" && row.regulationRef.trim()
          ? { regulationRef: row.regulationRef.trim() }
          : {}),
        ...(row.photoRequired === true ? { photoRequired: true } : {}),
        ...(row.measurementRequired === true ? { measurementRequired: true } : {}),
      });
    }
  }
  return out;
}

export function answeredSanitationCount(
  questions: readonly SanitationQuestion[],
  responses: Record<string, SanitationResponseEntry>,
): number {
  return questions.filter((q) => isSanitationAnswered(responses[q.id]?.result)).length;
}

export function buildResponsesJson(
  questions: readonly SanitationQuestion[],
  responses: Record<string, SanitationResponseEntry>,
): Record<string, SanitationResponseEntry> {
  const out: Record<string, SanitationResponseEntry> = {};
  for (const q of questions) {
    const entry = responses[q.id];
    if (!entry?.result || !isSanitationAnswered(entry.result)) continue;
    out[q.id] = {
      result: entry.result,
      ...(entry.notes?.trim() ? { notes: entry.notes.trim() } : {}),
      ...(entry.photos?.length
        ? { photos: entry.photos }
        : entry.photoDataUrl
          ? {
              photos: [
                {
                  id: "legacy",
                  fileName: "photo.jpg",
                  contentType: "image/jpeg",
                  dataUrl: entry.photoDataUrl,
                },
              ],
              photoDataUrl: entry.photoDataUrl,
            }
          : {}),
      label: entry.label ?? q.label,
      ...((entry.severity ?? q.severity) ? { severity: entry.severity ?? q.severity } : {}),
      ...(entry.dustDepth?.trim() ? { dustDepth: entry.dustDepth.trim() } : {}),
      ...(entry.dustUnit ? { dustUnit: entry.dustUnit } : {}),
    };
  }
  return out;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.readAsDataURL(file);
  });
}
