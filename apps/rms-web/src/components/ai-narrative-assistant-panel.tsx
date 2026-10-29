"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useFeatureFlags } from "@forge/web-kit";
import { RMS_FEATURE_FLAGS } from "@/lib/constants";
import {
  acceptAiNarrative,
  createAiNarrative,
  getAiNarrativeHistory,
  partialAcceptAiNarrative,
  regenerateAiNarrative,
  rejectAiNarrative,
  type AiNarrativeBundle,
  type AiNarrativeHistory,
  type AiNarrativeRequestType,
} from "@/lib/rms-api";
import styles from "../app/page.module.css";

const REQUIRED_WARNING =
  "AI-generated content may be incomplete or inaccurate. Review and verify every statement before saving or submitting this record.";

type ModeOption = {
  value: AiNarrativeRequestType;
  label: string;
  group: "generate" | "rewrite" | "quality";
};

const MODE_OPTIONS: ModeOption[] = [
  { value: "GENERATE_FROM_RECORD", label: "Generate from record", group: "generate" },
  { value: "IMPROVE_EXISTING", label: "Improve existing", group: "rewrite" },
  { value: "GRAMMAR_AND_CLARITY", label: "Grammar & clarity", group: "rewrite" },
  { value: "EXPAND_BRIEF_NOTES", label: "Expand brief notes", group: "rewrite" },
  { value: "CONDENSE", label: "Condense", group: "rewrite" },
  { value: "PROFESSIONALIZE", label: "Professionalize", group: "rewrite" },
  { value: "ACTIVE_VOICE", label: "Active voice", group: "rewrite" },
  { value: "TIMELINE_FORMAT", label: "Timeline format", group: "rewrite" },
  { value: "QUALITY_REVIEW", label: "Quality review", group: "quality" },
  { value: "MISSING_INFORMATION_CHECK", label: "Missing information", group: "quality" },
  { value: "CONTRADICTION_CHECK", label: "Contradiction check", group: "quality" },
];

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * AI Narrative Assistant panel. Hidden unless both master and RMS flags are true.
 * Defaults remain disabled platform-wide — including the Phase 4 synthetic tenant.
 */
export function AiNarrativeAssistantPanel({
  incidentId,
  incidentStatus,
  existingNarrative,
  onAccepted,
}: {
  incidentId: string;
  incidentStatus: string;
  existingNarrative?: string | null;
  onAccepted?: () => void;
}) {
  const { hasPermission } = useAuth();
  const { flags, loading } = useFeatureFlags([
    RMS_FEATURE_FLAGS.aiNarrativeEnabled,
    RMS_FEATURE_FLAGS.aiNarrativeRmsEnabled,
    RMS_FEATURE_FLAGS.aiNarrativeRewriteEnabled,
    RMS_FEATURE_FLAGS.aiNarrativeQualityCheckEnabled,
  ]);

  const canUse = hasPermission("ai.narrative.use");
  const canGenerate =
    hasPermission("ai.narrative.generate") || hasPermission("rms.incident.ai_narrative.generate");
  const canRewrite = hasPermission("ai.narrative.rewrite");
  const canAccept =
    hasPermission("ai.narrative.accept") || hasPermission("rms.incident.ai_narrative.accept");
  const canReject = hasPermission("ai.narrative.reject");

  const availableModes = useMemo(() => {
    const rewriteOn = Boolean(flags[RMS_FEATURE_FLAGS.aiNarrativeRewriteEnabled]);
    const qualityOn = Boolean(flags[RMS_FEATURE_FLAGS.aiNarrativeQualityCheckEnabled]);
    return MODE_OPTIONS.filter((option) => {
      if (option.group === "generate") return canGenerate || canUse;
      if (option.group === "rewrite") return rewriteOn && (canRewrite || canGenerate || canUse);
      if (option.group === "quality") return qualityOn && (canGenerate || canUse);
      return false;
    });
  }, [flags, canGenerate, canRewrite, canUse]);

  const [mode, setMode] = useState<AiNarrativeRequestType>("GENERATE_FROM_RECORD");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<AiNarrativeBundle | null>(null);
  const [history, setHistory] = useState<AiNarrativeHistory | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (availableModes.length === 0) return;
    if (!availableModes.some((option) => option.value === mode)) {
      setMode(availableModes[0]!.value);
    }
  }, [availableModes, mode]);

  const locked = ["FINALIZED", "VOIDED", "ARCHIVED"].includes(incidentStatus);
  const draft = bundle?.drafts[0] ?? null;
  const structured = draft?.structuredResponseJson ?? {};

  const missing = useMemo(
    () =>
      asStringList(structured.missingInformation).length
        ? asStringList(structured.missingInformation)
        : asStringList(draft?.missingInformationJson),
    [structured.missingInformation, draft?.missingInformationJson],
  );
  const conflicts = useMemo(() => asStringList(structured.conflicts), [structured.conflicts]);
  const warnings = useMemo(
    () =>
      asStringList(structured.warnings).length
        ? asStringList(structured.warnings)
        : asStringList(draft?.warningsJson),
    [structured.warnings, draft?.warningsJson],
  );
  const sourceFields = bundle?.sources[0]?.manifestJson?.fields ?? [];

  const run = useCallback(async (fn: () => Promise<AiNarrativeBundle>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setBundle(next);
      setHistory(null);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  async function handleGenerate() {
    if (!acknowledged) {
      setError("Acknowledge the required AI warning before generating.");
      return;
    }
    await run(() =>
      createAiNarrative({
        product: "RMS",
        module: "NERIS",
        recordType: "neris_incident",
        recordId: incidentId,
        requestType: mode,
        acknowledgeWarning: true,
        existingNarrative: existingNarrative ?? null,
      }),
    );
  }

  async function handleImprove() {
    setMode("IMPROVE_EXISTING");
    if (!acknowledged) {
      setError("Acknowledge the required AI warning before generating.");
      return;
    }
    await run(() =>
      createAiNarrative({
        product: "RMS",
        module: "NERIS",
        recordType: "neris_incident",
        recordId: incidentId,
        requestType: "IMPROVE_EXISTING",
        acknowledgeWarning: true,
        existingNarrative: existingNarrative ?? draft?.draftText ?? null,
      }),
    );
  }

  async function handleAccept(partial: boolean) {
    if (!bundle || !draft) return;
    const next = await run(() =>
      partial
        ? partialAcceptAiNarrative(bundle.request.id, {
            draftId: draft.id,
            insertIntoRecord: true,
            selectedSections: ["narrative"],
          })
        : acceptAiNarrative(bundle.request.id, {
            draftId: draft.id,
            mode: "ACCEPT_ALL",
            insertIntoRecord: true,
          }),
    );
    if (next) onAccepted?.();
  }

  async function handleReject() {
    if (!bundle || !draft) return;
    if (!rejectReason.trim()) {
      setError("Provide a rejection reason.");
      return;
    }
    await run(() =>
      rejectAiNarrative(bundle.request.id, {
        draftId: draft.id,
        reason: rejectReason.trim(),
      }),
    );
  }

  async function handleRegenerate() {
    if (!bundle) return;
    await run(() => regenerateAiNarrative(bundle.request.id));
  }

  async function handleHistory() {
    if (!bundle) return;
    setBusy(true);
    setError(null);
    try {
      setHistory(await getAiNarrativeHistory(bundle.request.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (
    !flags[RMS_FEATURE_FLAGS.aiNarrativeEnabled] ||
    !flags[RMS_FEATURE_FLAGS.aiNarrativeRmsEnabled]
  ) {
    return null;
  }

  const improveAvailable = availableModes.some((option) => option.value === "IMPROVE_EXISTING");
  const canOperate = canUse || canGenerate || canRewrite;

  return (
    <aside className={styles.panel} aria-label="AI Narrative Assistant" aria-busy={busy}>
      <h3>AI Narrative Assistant</h3>
      <p role="status" className={styles.warning}>
        {REQUIRED_WARNING}
      </p>
      <p className={styles.muted}>
        Drafting aid only. AI never finalizes incidents, submits NERIS, or replaces officer review.
      </p>

      {!canOperate ? (
        <p className={styles.error}>Missing AI narrative permission for this user.</p>
      ) : null}

      {locked ? (
        <p className={styles.error}>
          This incident is locked. AI cannot alter finalized records. Use an approved supplemental
          workflow if amendments are authorized.
        </p>
      ) : canOperate ? (
        <>
          <label className={styles.formRow}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />{" "}
            I acknowledge the required AI warning
          </label>

          <div className={styles.formRow}>
            <label htmlFor="ai-mode">Mode</label>
            <select
              id="ai-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as AiNarrativeRequestType)}
              disabled={busy || availableModes.length === 0}
            >
              {availableModes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              disabled={busy || availableModes.length === 0 || (!canGenerate && !canUse)}
              onClick={() => void handleGenerate()}
            >
              Generate
            </button>
            {improveAvailable ? (
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={
                  busy || (!canRewrite && !canGenerate && !canUse) || !existingNarrative?.trim()
                }
                onClick={() => void handleImprove()}
              >
                Improve
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {busy ? <p className={styles.muted}>Working…</p> : null}

      {draft ? (
        <>
          <div className={styles.panel}>
            <p>
              <strong>{draft.label || "AI DRAFT — NOT REVIEWED"}</strong>
            </p>
            <p className={styles.muted}>
              Status: {bundle?.request.status} · Provider: {bundle?.request.provider ?? "—"}
            </p>
            <pre className={styles.mono} style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {draft.draftText}
            </pre>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => setShowSources((v) => !v)}
            >
              {showSources ? "Hide" : "Show"} source review
            </button>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => setShowCompare((v) => !v)}
            >
              {showCompare ? "Hide" : "Compare"}
            </button>
            <button
              type="button"
              className={styles.buttonSecondary}
              disabled={busy || locked}
              onClick={() => void handleRegenerate()}
            >
              Regenerate
            </button>
            <button
              type="button"
              className={styles.buttonSecondary}
              disabled={busy}
              onClick={() => void handleHistory()}
            >
              History
            </button>
          </div>

          {showSources ? (
            <div className={styles.panel}>
              <h4>Source review</h4>
              {sourceFields.length === 0 ? (
                <p className={styles.muted}>No source fields in manifest.</p>
              ) : (
                <ul>
                  {sourceFields.map((field) => (
                    <li key={field.fieldId}>
                      {field.label} ({field.category}){field.included ? "" : " — excluded"}
                      {field.redacted ? " — redacted" : ""}
                      {field.valuePreview ? `: ${field.valuePreview}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {showCompare ? (
            <div className={styles.panel}>
              <h4>Compare</h4>
              <div className={styles.formRow}>
                <span className={styles.fieldLabel}>Existing narrative</span>
                <pre className={styles.mono} style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                  {existingNarrative?.trim() || "(empty)"}
                </pre>
              </div>
              <div className={styles.formRow}>
                <span className={styles.fieldLabel}>AI draft</span>
                <pre className={styles.mono} style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                  {draft.draftText}
                </pre>
              </div>
            </div>
          ) : null}

          {(missing.length > 0 || conflicts.length > 0 || warnings.length > 0) && (
            <div className={styles.panel}>
              {missing.length > 0 ? (
                <>
                  <h4>Missing information</h4>
                  <ul>
                    {missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {conflicts.length > 0 ? (
                <>
                  <h4>Conflicts</h4>
                  <ul>
                    {conflicts.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {warnings.length > 0 ? (
                <>
                  <h4>Warnings</h4>
                  <ul>
                    {warnings.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          )}

          {!locked && bundle?.request.status === "READY_FOR_REVIEW" ? (
            <>
              <div className={styles.actions}>
                {canAccept ? (
                  <button
                    type="button"
                    className={styles.button}
                    disabled={busy}
                    onClick={() => void handleAccept(false)}
                  >
                    Accept
                  </button>
                ) : null}
              </div>
              {canReject ? (
                <>
                  <div className={styles.formRow}>
                    <label htmlFor="ai-reject-reason">Reject reason</label>
                    <input
                      id="ai-reject-reason"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Why is this draft unsuitable?"
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    disabled={busy}
                    onClick={() => void handleReject()}
                  >
                    Reject
                  </button>
                </>
              ) : null}
            </>
          ) : null}

          {history ? (
            <div className={styles.panel}>
              <h4>History</h4>
              <ul>
                {history.revisions.map((rev) => (
                  <li key={rev.id}>
                    {rev.action} · {new Date(rev.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
              <p className={styles.muted}>
                Draft versions: {history.drafts.map((d) => `v${d.version} (${d.label})`).join(", ")}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
