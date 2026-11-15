"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormSignaturePad } from "@/components/form-signature-pad";
import { FieldPhotoMarkupGate } from "@/components/field-photo-markup-gate";
import { PhotoCompareViewer } from "@forge/photo-markup";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { fieldInspectionApi } from "@/lib/inspection-api";
import {
  answeredCount,
  canCompleteInspection,
  clearInspectionDraft,
  compressImageFile,
  criticalDeficiencyCount,
  deficiencyCount,
  FALLBACK_INSPECTION_TEMPLATE,
  findingsFromItems,
  hasInspectorSignature,
  isCriticalInspectionItem,
  itemsFromTemplate,
  loadInspectionDraft,
  parseInspectionItems,
  photoCount,
  saveInspectionDraft,
  type InspectionAnswer,
  type InspectionPhoto,
  type InspectionRunItem,
  type InspectionTemplate,
} from "@/lib/inspections";

type Step = "loading" | "pickTemplate" | "question" | "evidence" | "review" | "success" | "error";

type StartContext = {
  targetType?: string | null;
  targetId?: string | null;
  qrLinkId?: string | null;
  frequency?: string | null;
  templateId?: string | null;
  scanToken?: string | null;
};

export function InspectionRunner({
  inspectionId: existingId,
  startContext,
}: {
  inspectionId?: string | null;
  startContext?: StartContext;
}) {
  const router = useRouter();
  const { profile } = useFieldProfile();
  const org = useFieldOrgOptional();
  const [step, setStep] = useState<Step>("loading");
  const [inspectionId, setInspectionId] = useState<string | null>(existingId ?? null);
  const [title, setTitle] = useState("Inspection");
  const [items, setItems] = useState<InspectionRunItem[]>([]);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [completeResult, setCompleteResult] = useState<{
    id: string;
    deficiencies: number;
    critical: number;
    correctiveActions: number;
    findings: InspectionRunItem[];
    outOfService?: boolean;
    reason?: string | null;
  } | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{
    id: string;
    items: InspectionRunItem[];
    title: string;
  } | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<InspectionPhoto | null>(null);
  const [comparePhoto, setComparePhoto] = useState<InspectionPhoto | null>(null);
  const saveTimer = useRef<number | null>(null);
  const bootstrapped = useRef(false);
  const pendingStart = useRef(startContext);

  const current = items[index] ?? null;
  const progress = items.length ? Math.round((answeredCount(items) / items.length) * 100) : 0;
  const findings = useMemo(() => findingsFromItems(items), [items]);
  const criticalCount = useMemo(() => criticalDeficiencyCount(items), [items]);

  const persist = useCallback(async (nextItems: InspectionRunItem[], id: string) => {
    saveInspectionDraft(id, nextItems);
    setSaveHint("Draft saved on device");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void fieldInspectionApi
        .patch(id, { items: nextItems })
        .then(() => setSaveHint("Draft synced"))
        .catch(() => setSaveHint("Draft saved offline"));
    }, 600);
  }, []);

  const startWithTemplate = useCallback(
    async (template: InspectionTemplate, context: StartContext | undefined) => {
      const checklist = itemsFromTemplate(template);
      const locationName =
        org?.locations.find((l) => l.id === org.selection.locationId)?.name ??
        org?.selection.locationName ??
        "";
      const departmentName =
        org?.departments.find((d) => d.id === org.selection.departmentId)?.name ?? "";
      const created = await fieldInspectionApi.create({
        title: `${template.name}${context?.frequency ? ` (${context.frequency})` : ""}`,
        templateId: template.id === "builtin-general-area" ? null : template.id,
        templateName: template.name,
        items: checklist,
        targetType: context?.targetType ?? undefined,
        targetId: context?.targetId ?? undefined,
        qrLinkId: context?.qrLinkId ?? undefined,
        inspectionFrequency: context?.frequency ?? undefined,
        qrScanSource: context?.scanToken ? "field-qr" : undefined,
        siteId: org?.selection.locationId || undefined,
        locationId: org?.selection.locationId || undefined,
        locationName: locationName || undefined,
        divisionName: org?.selection.divisionName || undefined,
        departmentId: org?.selection.departmentId || undefined,
        departmentName: departmentName || undefined,
        responsiblePersonnelId: profile?.personnelId ?? undefined,
        responsibleName: profile?.displayName ?? undefined,
        performerPersonnelId: profile?.personnelId ?? undefined,
        performerName: profile?.displayName ?? undefined,
        appBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      setInspectionId(created.id);
      setTitle(created.title || template.name);
      setItems(checklist);
      setIndex(0);
      setStep("question");
      router.replace(`/inspection/${encodeURIComponent(created.id)}/`);
    },
    [org, profile, router],
  );

  const bootstrap = useCallback(async () => {
    setStep("loading");
    setError(null);
    try {
      if (existingId && existingId !== "new" && existingId !== "placeholder") {
        const record = await fieldInspectionApi.get(existingId);
        const serverItems = parseInspectionItems(record.items ?? record.sourcePayload?.items);
        const draft = loadInspectionDraft(existingId);
        const merged = draft?.length ? draft : serverItems;
        if (draft?.length && answeredCount(serverItems) < answeredCount(draft)) {
          setResumePrompt({
            id: existingId,
            items: draft,
            title: record.title || "Inspection",
          });
        }
        setInspectionId(existingId);
        setTitle(record.title || "Inspection");
        setItems(merged.length ? merged : serverItems);
        const sig =
          (typeof record.signature === "string" && record.signature) ||
          (typeof record.sourcePayload?.signature === "string"
            ? record.sourcePayload.signature
            : "");
        if (sig) setSignature(sig);
        const firstUnanswered = merged.findIndex((item) => item.answer == null);
        setIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
        setStep("question");
        return;
      }

      const deptId = org?.selection.departmentId;
      const list = await fieldInspectionApi.listTemplates(
        deptId ? { departmentId: deptId } : undefined,
      );
      setTemplates(list);
      const context = pendingStart.current;
      if (context?.templateId) {
        const match =
          list.find((t) => t.id === context.templateId) || list[0] || FALLBACK_INSPECTION_TEMPLATE;
        await startWithTemplate(match, context);
        return;
      }
      if (list.length <= 1) {
        await startWithTemplate(list[0] || FALLBACK_INSPECTION_TEMPLATE, context);
        return;
      }
      setStep("pickTemplate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the inspection.");
      setStep("error");
    }
  }, [existingId, org?.selection.departmentId, startWithTemplate]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  function updateItem(itemId: string, patch: Partial<InspectionRunItem>) {
    setItems((prev) => {
      const next = prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
      if (inspectionId) void persist(next, inspectionId);
      return next;
    });
  }

  function answerCurrent(answer: InspectionAnswer) {
    if (!current) return;
    updateItem(current.id, { answer });
    if (answer === "NO") {
      setStep("evidence");
      return;
    }
    goNext(index + 1);
  }

  function goNext(nextIndex: number) {
    if (nextIndex >= items.length) {
      setStep("review");
      return;
    }
    setIndex(nextIndex);
    setStep("question");
  }

  async function onAddPhotos(files: FileList | null) {
    if (!current || !files?.length) return;
    setBusy(true);
    setError(null);
    try {
      // Capture/upload one at a time so each can be marked up.
      const file = Array.from(files)[0];
      if (!file) return;
      const photo = await compressImageFile(file);
      setPendingPhoto(photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add photo.");
    } finally {
      setBusy(false);
    }
  }

  async function commitPhoto(photo: InspectionPhoto) {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const photos = [...(current.photos ?? []), photo];
      const attachmentIds = [...(current.photoAttachmentIds ?? [])];
      if (inspectionId) {
        try {
          const uploaded = await fieldInspectionApi.attachPhoto(inspectionId, current.id, photo);
          attachmentIds.push(uploaded.id);
        } catch {
          // Keep inline photo for draft/complete even if attachment API fails.
        }
      }
      updateItem(current.id, { photos, photoAttachmentIds: attachmentIds });
      setPendingPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save photo.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!inspectionId) return;
    const check = canCompleteInspection(items);
    if (!check.ok) {
      setError(check.reason ?? "Finish all required answers.");
      return;
    }
    if (!hasInspectorSignature(signature)) {
      setError("Add your signature before submitting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signatureName = signature.startsWith("typed:")
        ? signature.slice("typed:".length)
        : profile?.displayName || "";
      await fieldInspectionApi.patch(inspectionId, {
        items,
        signature,
        signatureName,
      });
      const result = await fieldInspectionApi.complete(inspectionId, {
        items,
        signature,
        signatureName,
        ...(typeof window !== "undefined" ? { appBaseUrl: window.location.origin } : {}),
      });
      clearInspectionDraft(inspectionId);
      const completedItems = parseInspectionItems(
        result.items ?? result.sourcePayload?.items ?? items,
      );
      setCompleteResult({
        id: inspectionId,
        deficiencies: deficiencyCount(completedItems),
        critical: criticalDeficiencyCount(completedItems),
        correctiveActions: completedItems.filter((i) => i.correctiveActionId).length,
        findings: findingsFromItems(completedItems),
        outOfService: Boolean(result.assetOutOfService ?? result.sourcePayload?.assetOutOfService),
        reason:
          result.outOfServiceReason ??
          (typeof result.sourcePayload?.outOfServiceReason === "string"
            ? result.sourcePayload.outOfServiceReason
            : null),
      });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save this yet. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const reviewReady = useMemo(() => canCompleteInspection(items), [items]);
  const orgLine = [
    org?.selection.divisionName,
    org?.selection.locationName ||
      org?.locations.find((l) => l.id === org.selection.locationId)?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  if (step === "loading") {
    return <p className="ff-page-body">Starting inspection…</p>;
  }

  if (step === "pickTemplate") {
    return (
      <>
        <p className="ff-brand-mark">Inspection</p>
        <h1 className="ff-page-title">Choose checklist</h1>
        <p className="ff-page-body">
          Templates come from Forge Industrial Safety
          {orgLine ? ` · ${orgLine}` : ""}.
        </p>
        <div className="ff-task-list">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="ff-task-card"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void startWithTemplate(template, pendingStart.current)
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : "Could not start inspection");
                    setStep("error");
                  })
                  .finally(() => setBusy(false));
              }}
            >
              <div className="ff-task-card-body">
                <span className="ff-task-kind">{template.source || "Template"}</span>
                <span className="ff-task-title">{template.name}</span>
                <span className="ff-meta">
                  {template.items.length} questions
                  {template.departmentHint ? ` · ${template.departmentHint}` : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (resumePrompt) {
    return (
      <>
        <h1 className="ff-page-title">Resume inspection?</h1>
        <p className="ff-page-body">{resumePrompt.title}</p>
        <p className="ff-meta">A draft was saved on this device.</p>
        <button
          type="button"
          className="ff-btn"
          onClick={() => {
            setItems(resumePrompt.items);
            const firstUnanswered = resumePrompt.items.findIndex((item) => item.answer == null);
            setIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
            setResumePrompt(null);
            setStep("question");
          }}
        >
          Continue
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          onClick={() => {
            clearInspectionDraft(resumePrompt.id);
            setResumePrompt(null);
            setStep("question");
          }}
        >
          Start over
        </button>
      </>
    );
  }

  if (step === "error") {
    return (
      <>
        <h1 className="ff-page-title">Inspection unavailable</h1>
        <p className="ff-error" role="alert">
          {error}
        </p>
        <button
          type="button"
          className="ff-btn"
          onClick={() => {
            bootstrapped.current = false;
            void bootstrap();
          }}
        >
          Try again
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          onClick={() => router.push("/inspections/")}
        >
          Inspections
        </button>
      </>
    );
  }

  if (step === "success" && completeResult) {
    return (
      <>
        <p className="ff-brand-mark">Submitted</p>
        <h1 className="ff-page-title">Inspection submitted</h1>
        <div className="ff-due-card">
          <strong>{title}</strong>
          <p>
            {new Date().toLocaleString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          {orgLine ? <p className="ff-meta">{orgLine}</p> : null}
          <p className="ff-meta">Inspection ID · {completeResult.id}</p>
          {completeResult.deficiencies > 0 ? (
            <p>
              {completeResult.deficiencies} finding
              {completeResult.deficiencies === 1 ? "" : "s"}
              {completeResult.critical ? ` · ${completeResult.critical} critical` : ""}
              {completeResult.correctiveActions
                ? ` · ${completeResult.correctiveActions} corrective action${completeResult.correctiveActions === 1 ? "" : "s"} created`
                : ""}
              .
            </p>
          ) : (
            <p>No deficiencies recorded.</p>
          )}
        </div>
        {completeResult.outOfService ? (
          <div className="ff-oos" role="status">
            <strong>OUT OF SERVICE</strong>
            <span>{completeResult.reason || "Equipment was marked out of service."}</span>
          </div>
        ) : null}
        {completeResult.findings.length > 0 ? (
          <section className="ff-section">
            <h2 className="ff-section-title">Findings</h2>
            <div className="ff-task-list">
              {completeResult.findings.map((finding) => (
                <div key={finding.id} className="ff-due-card">
                  <strong>
                    {isCriticalInspectionItem(finding) ? "Critical · " : ""}
                    {finding.label}
                  </strong>
                  {finding.notes ? <p className="ff-meta">{finding.notes}</p> : null}
                  {finding.correctiveActionId ? (
                    <button
                      type="button"
                      className="ff-btn ff-btn-secondary"
                      onClick={() =>
                        router.push(
                          `/corrective/${encodeURIComponent(finding.correctiveActionId!)}/`,
                        )
                      }
                    >
                      Open corrective action
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <button type="button" className="ff-btn" onClick={() => router.push("/inspections/")}>
          Back to inspections
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          onClick={() => router.push("/scan/")}
        >
          Scan another
        </button>
      </>
    );
  }

  if (step === "review") {
    return (
      <>
        <h1 className="ff-page-title">Review inspection</h1>
        <div className="ff-work-summary">
          <div className="ff-work-row">
            <span>Title</span>
            <span>{title}</span>
          </div>
          {orgLine ? (
            <div className="ff-work-row">
              <span>Org</span>
              <span>{orgLine}</span>
            </div>
          ) : null}
          <div className="ff-work-row">
            <span>Inspector</span>
            <span>{profile?.displayName || "You"}</span>
          </div>
          <div className="ff-work-row">
            <span>Questions</span>
            <span>
              {answeredCount(items)} / {items.length}
            </span>
          </div>
          <div className="ff-work-row">
            <span>Findings</span>
            <span className="ff-work-count">{deficiencyCount(items)}</span>
          </div>
          {criticalCount > 0 ? (
            <div className="ff-work-row">
              <span>Critical</span>
              <span className="ff-work-count">{criticalCount}</span>
            </div>
          ) : null}
          <div className="ff-work-row">
            <span>Photos</span>
            <span>{photoCount(items)}</span>
          </div>
        </div>
        {findings.length > 0 ? (
          <section className="ff-section">
            <h2 className="ff-section-title">Findings</h2>
            <ul className="ff-page-body" style={{ paddingLeft: 18 }}>
              {findings.map((finding) => (
                <li key={finding.id}>
                  {isCriticalInspectionItem(finding) ? <strong>Critical: </strong> : null}
                  {finding.label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="ff-field">
          <span className="ff-label">Inspector signature</span>
          <FormSignaturePad value={signature} onChange={setSignature} disabled={busy} />
        </div>
        {saveHint ? <p className="ff-meta">{saveHint}</p> : null}
        {error ? (
          <p className="ff-error" role="alert">
            {error}
          </p>
        ) : null}
        {!reviewReady.ok ? <p className="ff-page-body">{reviewReady.reason}</p> : null}
        <button
          type="button"
          className="ff-btn"
          disabled={busy || !reviewReady.ok || !hasInspectorSignature(signature)}
          onClick={() => void submit()}
        >
          {busy ? "Submitting…" : "Submit inspection"}
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          onClick={() => {
            const firstUnanswered = items.findIndex((item) => item.answer == null);
            setIndex(firstUnanswered >= 0 ? firstUnanswered : Math.max(0, items.length - 1));
            setStep("question");
          }}
        >
          Back
        </button>
      </>
    );
  }

  if (step === "evidence" && current) {
    const critical = isCriticalInspectionItem(current);
    return (
      <>
        <p className="ff-section-title">
          {index + 1} of {items.length}
          {critical ? " · Critical finding" : " · Finding"}
        </p>
        <h1 className="ff-page-title" style={{ fontSize: 20 }}>
          Describe the issue
        </h1>
        {critical ? (
          <div className="ff-oos" role="status">
            <strong>CRITICAL</strong>
            <span>This finding will create a corrective action on submit.</span>
          </div>
        ) : null}
        <p className="ff-page-body">{current.label}</p>
        <div className="ff-field">
          <label htmlFor="insp-notes">Notes (required)</label>
          <textarea
            id="insp-notes"
            className="ff-input"
            style={{ minHeight: 120, padding: 14, width: "100%" }}
            value={current.notes ?? ""}
            onChange={(e) => updateItem(current.id, { notes: e.target.value })}
          />
        </div>
        <label
          className="ff-btn ff-btn-secondary"
          style={{ display: "block", textAlign: "center" }}
        >
          Add photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => void onAddPhotos(e.target.files)}
          />
        </label>
        {(current.photos?.length ?? 0) > 0 ? (
          <div className="ff-photo-grid">
            {current.photos!.map((photo) => (
              <div key={photo.id} className="ff-photo-thumb" style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (photo.hasMarkup && photo.originalDataUrl) {
                      setComparePhoto(photo);
                    }
                  }}
                  style={{
                    display: "block",
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    width: "100%",
                    cursor: photo.hasMarkup && photo.originalDataUrl ? "pointer" : "default",
                  }}
                  aria-label={
                    photo.hasMarkup ? `Compare marked photo ${photo.fileName}` : photo.fileName
                  }
                >
                  <img src={photo.dataUrl} alt={photo.fileName} />
                </button>
                {photo.hasMarkup ? (
                  <span
                    style={{
                      position: "absolute",
                      left: 4,
                      bottom: 4,
                      background: "rgba(37,99,235,0.92)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      pointerEvents: "none",
                    }}
                  >
                    MARKED
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {error ? (
          <p className="ff-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="ff-btn"
          disabled={busy || !(current.notes ?? "").trim()}
          onClick={() => goNext(index + 1)}
        >
          Next
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          onClick={() => setStep("question")}
        >
          Back
        </button>
        <FieldPhotoMarkupGate
          open={Boolean(pendingPhoto)}
          pending={pendingPhoto ? { original: pendingPhoto } : null}
          onCancel={() => setPendingPhoto(null)}
          onSaveWithoutMarkup={(photo) => void commitPhoto(photo)}
          onSaveWithMarkup={(photo) => void commitPhoto(photo)}
        />
        {comparePhoto?.originalDataUrl ? (
          <PhotoCompareViewer
            originalSrc={comparePhoto.originalDataUrl}
            markedSrc={comparePhoto.dataUrl}
            title="Compare original / marked"
            onClose={() => setComparePhoto(null)}
          />
        ) : null}
      </>
    );
  }

  if (!current) {
    return (
      <>
        <h1 className="ff-page-title">No checklist items</h1>
        <button type="button" className="ff-btn" onClick={() => router.push("/inspections/")}>
          Inspections
        </button>
      </>
    );
  }

  return (
    <>
      <div className="ff-progress-wrap" aria-label={`Progress ${progress}%`}>
        <div className="ff-progress-bar" style={{ width: `${Math.max(8, progress)}%` }} />
      </div>
      <p className="ff-section-title">
        {index + 1} of {items.length}
        {current.section ? ` · ${current.section}` : ""}
        {isCriticalInspectionItem(current) ? " · Critical" : ""}
        {saveHint ? ` · ${saveHint}` : ""}
      </p>
      <h1 className="ff-page-title" style={{ fontSize: 22 }}>
        {current.label}
      </h1>
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="ff-answer-row">
        <button
          type="button"
          className={`ff-answer-btn ff-answer-yes${current?.answer === "YES" ? " is-selected" : ""}`}
          aria-pressed={current?.answer === "YES"}
          onClick={() => answerCurrent("YES")}
        >
          YES
        </button>
        <button
          type="button"
          className={`ff-answer-btn ff-answer-no${current?.answer === "NO" ? " is-selected" : ""}`}
          aria-pressed={current?.answer === "NO"}
          onClick={() => answerCurrent("NO")}
        >
          NO
        </button>
        <button
          type="button"
          className={`ff-answer-btn ff-answer-na${current?.answer === "NA" ? " is-selected" : ""}`}
          aria-pressed={current?.answer === "NA"}
          onClick={() => answerCurrent("NA")}
        >
          N/A
        </button>
      </div>
      <div className="ff-action-grid ff-section">
        <button
          type="button"
          className="ff-action-tile"
          disabled={index === 0}
          onClick={() => {
            setIndex(Math.max(0, index - 1));
            setStep("question");
          }}
        >
          Back
        </button>
        <button
          type="button"
          className="ff-action-tile"
          onClick={() => {
            if (inspectionId) saveInspectionDraft(inspectionId, items);
            setStep("review");
          }}
        >
          Review
        </button>
      </div>
    </>
  );
}
