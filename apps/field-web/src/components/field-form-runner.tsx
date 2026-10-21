"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { FormSignaturePad } from "@/components/form-signature-pad";
import { FieldPhotoMarkupGate } from "@/components/field-photo-markup-gate";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldOrg } from "@/components/field-org-provider";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { fieldFormApi } from "@/lib/form-api";
import {
  answeredProgress,
  buildFormAnswersPayload,
  clearFormDraft,
  compressImageFile,
  extractFormFields,
  hydrateFormAnswers,
  isAnswerableField,
  isFieldVisible,
  loadFormDraft,
  normalizeYesNoAnswer,
  parsePhotoAnswer,
  saveFormDraft,
  validateFormAnswers,
  visibleFields,
  yesNoNotesFieldId,
  type FieldFormAnswers,
  type FieldFormField,
  type FieldFormPhoto,
} from "@/lib/field-forms";

type RunnerStep = "loading" | "fill" | "success" | "error";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function applyOrgDefaults(
  fields: readonly FieldFormField[],
  answers: FieldFormAnswers,
  org: {
    locationId: string;
    locationName: string;
    divisionName: string;
    departmentId: string;
    departmentName: string;
  },
  profileName: string,
): FieldFormAnswers {
  const next = { ...answers };
  for (const field of fields) {
    if ((next[field.id] ?? "").trim()) continue;
    if (field.type === "location" || /^location$/i.test(field.label)) {
      next[field.id] = org.locationName || org.locationId;
      continue;
    }
    if (field.type === "division" || /^division$/i.test(field.label)) {
      next[field.id] = org.divisionName;
      continue;
    }
    if (field.type === "department" || /^department$/i.test(field.label)) {
      next[field.id] = org.departmentName || org.departmentId;
      continue;
    }
    if (field.type === "date" && /date/i.test(field.label)) {
      next[field.id] = todayIsoDate();
      continue;
    }
    if (
      field.id === "submittedBy" ||
      /^submitted\s*by$/i.test(field.label) ||
      /^inspector$/i.test(field.label)
    ) {
      next[field.id] = profileName;
    }
  }
  return next;
}

export function FieldFormRunner({
  formId,
  submissionId: initialSubmissionId,
}: {
  formId: string;
  submissionId?: string | null;
}) {
  const router = useRouter();
  const { profile } = useFieldProfile();
  const org = useFieldOrg();
  const [step, setStep] = useState<RunnerStep>("loading");
  const [title, setTitle] = useState("Form");
  const [fields, setFields] = useState<FieldFormField[]>([]);
  const [answers, setAnswers] = useState<FieldFormAnswers>({});
  const [submissionId, setSubmissionId] = useState<string | null>(initialSubmissionId ?? null);
  const [busy, setBusy] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusFieldId, setFocusFieldId] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{
    fieldId: string;
    photo: FieldFormPhoto;
  } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const bootstrapped = useRef(false);
  const creatingDraftRef = useRef(false);
  const submissionIdRef = useRef<string | null>(initialSubmissionId ?? null);

  useEffect(() => {
    submissionIdRef.current = submissionId;
  }, [submissionId]);

  const progress = useMemo(() => answeredProgress(fields, answers), [fields, answers]);
  const visible = useMemo(() => visibleFields(fields, answers), [fields, answers]);

  const locationName =
    org.locations.find((l) => l.id === org.selection.locationId)?.name ?? "";
  const departmentName =
    org.departments.find((d) => d.id === org.selection.departmentId)?.name ?? "";

  const queueAutosave = useCallback(
    (definitionId: string, nextAnswers: FieldFormAnswers, nextSubmissionId: string | null) => {
      const knownId = nextSubmissionId || submissionIdRef.current;
      saveFormDraft(definitionId, {
        definitionId,
        submissionId: knownId,
        answers: nextAnswers,
      });
      setSaveHint("Draft saved on device");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void (async () => {
          try {
            let id = submissionIdRef.current || knownId;
            const payload = buildFormAnswersPayload(nextAnswers, fields);
            if (!id) {
              if (creatingDraftRef.current) return;
              creatingDraftRef.current = true;
              try {
                const created = await fieldFormApi.createSubmission({
                  formDefinitionId: definitionId,
                  title,
                  answers: payload,
                  status: "DRAFT",
                  personnelId: profile?.personnelId ?? null,
                });
                id = String(created.id);
                submissionIdRef.current = id;
                setSubmissionId(id);
                saveFormDraft(definitionId, {
                  definitionId,
                  submissionId: id,
                  answers: nextAnswers,
                });
              } finally {
                creatingDraftRef.current = false;
              }
            } else {
              await fieldFormApi.patchSubmission(id, {
                answers: payload,
                status: "DRAFT",
              });
            }
            setSaveHint("Draft synced");
          } catch {
            setSaveHint("Draft saved offline");
          }
        })();
      }, 700);
    },
    [fields, profile?.personnelId, title],
  );

  const setAnswer = useCallback(
    (fieldId: string, value: string) => {
      setAnswers((prev) => {
        const next = { ...prev, [fieldId]: value };
        queueAutosave(formId, next, submissionId);
        return next;
      });
    },
    [formId, queueAutosave, submissionId],
  );

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    let cancelled = false;

    void (async () => {
      setStep("loading");
      setError(null);
      try {
        const definition = await fieldFormApi.getDefinition(formId);
        if (cancelled) return;
        const extracted = extractFormFields(definition as unknown as Record<string, unknown>);
        setTitle(String(definition.title ?? "Form"));
        setFields(extracted);

        let hydrated: FieldFormAnswers = {};
        let subId = initialSubmissionId?.trim() || null;

        if (subId) {
          try {
            const submission = await fieldFormApi.getSubmission(subId);
            hydrated = hydrateFormAnswers(submission.answers, extracted);
            setSubmissionId(String(submission.id));
          } catch {
            subId = null;
          }
        }

        const draft = loadFormDraft(formId);
        if (draft?.answers && Object.keys(draft.answers).length > 0) {
          const draftAnswered = Object.values(draft.answers).filter((v) => String(v).trim()).length;
          const serverAnswered = Object.values(hydrated).filter((v) => String(v).trim()).length;
          if (draftAnswered >= serverAnswered) {
            hydrated = { ...hydrated, ...draft.answers };
            if (!subId && draft.submissionId) {
              subId = draft.submissionId;
              setSubmissionId(draft.submissionId);
            }
          }
        }

        const profileName =
          profile?.displayName ||
          [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
          "";
        hydrated = applyOrgDefaults(
          extracted,
          hydrated,
          {
            locationId: org.selection.locationId,
            locationName,
            divisionName: org.selection.divisionName,
            departmentId: org.selection.departmentId,
            departmentName,
          },
          profileName,
        );

        setAnswers(hydrated);
        setStep("fill");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load form");
        setStep("error");
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
    // Bootstrap once per formId mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  async function ensureDraftSubmission(nextAnswers: FieldFormAnswers): Promise<string> {
    if (submissionId) return submissionId;
    const created = await fieldFormApi.createSubmission({
      formDefinitionId: formId,
      title,
      answers: buildFormAnswersPayload(nextAnswers, fields),
      status: "DRAFT",
      personnelId: profile?.personnelId ?? null,
    });
    const id = String(created.id);
    setSubmissionId(id);
    saveFormDraft(formId, { definitionId: formId, submissionId: id, answers: nextAnswers });
    return id;
  }

  async function handleSaveDraft() {
    setBusy(true);
    setError(null);
    try {
      await ensureDraftSubmission(answers);
      setSaveHint("Draft saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save draft");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    const validation = validateFormAnswers(fields, answers);
    if (!validation.ok) {
      setError(validation.message);
      setFocusFieldId(validation.fieldId ?? null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = buildFormAnswersPayload(answers, fields);
      const id = await ensureDraftSubmission(answers);
      await fieldFormApi.patchSubmission(id, {
        title,
        answers: payload,
        status: "SUBMITTED",
        personnelId: profile?.personnelId ?? null,
      });
      clearFormDraft(formId);
      setStep("success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit form");
    } finally {
      setBusy(false);
    }
  }

  async function onPhotoSelected(fieldId: string, fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    try {
      const existing = parsePhotoAnswer(answers[fieldId] ?? "");
      if (existing.length >= 8) return;
      const file = Array.from(fileList).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      const photo = await compressImageFile(file);
      setPendingPhoto({ fieldId, photo });
    } catch {
      setError("Could not attach photo");
    } finally {
      setBusy(false);
    }
  }

  function commitFormPhoto(photo: FieldFormPhoto) {
    if (!pendingPhoto) return;
    const existing = parsePhotoAnswer(answers[pendingPhoto.fieldId] ?? "");
    const nextPhotos = [...existing, photo].slice(0, 8);
    setAnswer(pendingPhoto.fieldId, JSON.stringify(nextPhotos));
    setPendingPhoto(null);
  }

  if (step === "loading") return <LoadingState label="Loading form…" />;

  if (step === "error") {
    return (
      <ErrorState
        title="Form unavailable"
        message={error ?? "Could not load this form."}
        onRetry={() => router.push("/forms/")}
      />
    );
  }

  if (step === "success") {
    return (
      <>
        <p className="ff-brand-mark">Form</p>
        <h1 className="ff-page-title">Submitted</h1>
        <EmptyState title={title} message="Your form was submitted successfully." />
        <div className="ff-action-grid">
          <button type="button" className="ff-btn" onClick={() => router.push("/tasks/")}>
            My Work
          </button>
          <button type="button" className="ff-btn ff-btn-secondary" onClick={() => router.push("/")}>
            Home
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="ff-brand-mark">Form</p>
      <h1 className="ff-page-title">{title}</h1>
      <div className="ff-progress-wrap" aria-label="Form progress">
        <div className="ff-progress-bar" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="ff-hint ff-hint--left">
        {progress.answered} / {progress.total} answered · {progress.percent}%
        {saveHint ? ` · ${saveHint}` : ""}
      </p>

      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ff-form-fields">
        {visible.map((field) => (
          <FormFieldControl
            key={field.id}
            field={field}
            answers={answers}
            focus={focusFieldId === field.id}
            disabled={busy}
            locations={org.locations}
            divisions={org.divisions}
            departments={org.departments.filter(
              (d) =>
                !org.selection.locationId ||
                !d.locationId ||
                d.locationId === org.selection.locationId,
            )}
            onChange={setAnswer}
            onPhotos={(files) => void onPhotoSelected(field.id, files)}
            onRemovePhoto={(photoId) => {
              const next = parsePhotoAnswer(answers[field.id] ?? "").filter((p) => p.id !== photoId);
              setAnswer(field.id, next.length ? JSON.stringify(next) : "");
            }}
          />
        ))}
      </div>

      <div className="ff-action-grid" style={{ marginTop: 20 }}>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => void handleSubmit()}>
          Submit
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          disabled={busy}
          onClick={() => void handleSaveDraft()}
        >
          Save draft
        </button>
      </div>
      <FieldPhotoMarkupGate
        open={Boolean(pendingPhoto)}
        module="forms"
        pending={pendingPhoto ? { original: pendingPhoto.photo } : null}
        onCancel={() => setPendingPhoto(null)}
        onSaveWithoutMarkup={(photo) => commitFormPhoto(photo)}
        onSaveWithMarkup={(photo) => commitFormPhoto(photo)}
      />
    </>
  );
}

function FormFieldControl({
  field,
  answers,
  focus: _focus,
  disabled,
  locations,
  divisions,
  departments,
  onChange,
  onPhotos,
  onRemovePhoto,
}: {
  field: FieldFormField;
  answers: FieldFormAnswers;
  focus: boolean;
  disabled: boolean;
  locations: Array<{ id: string; name: string }>;
  divisions: string[];
  departments: Array<{ id: string; name: string }>;
  onChange: (fieldId: string, value: string) => void;
  onPhotos: (files: FileList | null) => void;
  onRemovePhoto: (photoId: string) => void;
}) {
  if (!isFieldVisible(field, answers)) return null;
  if (field.type === "label") {
    return <h2 className="ff-section-title">{field.label}</h2>;
  }
  if (field.type === "content") {
    return (
      <div className="ff-card">
        <p className="ff-page-body" style={{ margin: 0 }}>
          {field.content || field.label}
        </p>
      </div>
    );
  }

  const value = answers[field.id] ?? "";
  const requiredMark = field.required ? " *" : "";

  if (field.type === "yesno") {
    const notesId = yesNoNotesFieldId(field.id);
    const answer = normalizeYesNoAnswer(value);
    return (
      <div className="ff-field" id={`field-${field.id}`}>
        <label>
          {field.label}
          {requiredMark}
        </label>
        <div className="ff-action-grid">
          {(["YES", "NO", "NA"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`ff-btn ${answer === option ? "" : "ff-btn-secondary"}`}
              disabled={disabled}
              onClick={() => onChange(field.id, option)}
            >
              {option === "NA" ? "N/A" : option === "YES" ? "Yes" : "No"}
            </button>
          ))}
        </div>
        {answer === "NO" || (answers[notesId] ?? "").trim() ? (
          <textarea
            className="ff-input"
            value={answers[notesId] ?? ""}
            disabled={disabled}
            placeholder="Notes (required for No)"
            onChange={(e) => onChange(notesId, e.target.value)}
          />
        ) : null}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="ff-field" id={`field-${field.id}`}>
        <label className="ff-check-row">
          <input
            type="checkbox"
            checked={value === "true"}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.checked ? "true" : "")}
          />
          <span>
            {field.label}
            {requiredMark}
          </span>
        </label>
      </div>
    );
  }

  if (field.type === "signature") {
    return (
      <div className="ff-field" id={`field-${field.id}`}>
        <label>
          {field.label}
          {requiredMark}
        </label>
        <FormSignaturePad
          value={value}
          disabled={disabled}
          onChange={(next) => onChange(field.id, next)}
        />
      </div>
    );
  }

  if (field.type === "photo") {
    const photos = parsePhotoAnswer(value);
    return (
      <div className="ff-field" id={`field-${field.id}`}>
        <label>
          {field.label}
          {requiredMark}
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          disabled={disabled}
          onChange={(e) => onPhotos(e.target.files)}
        />
        {photos.length > 0 ? (
          <div className="ff-photo-grid">
            {photos.map((photo) => (
              <div key={photo.id} className="ff-photo-thumb">
                <img src={photo.dataUrl} alt={photo.fileName} />
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary"
                  disabled={disabled}
                  onClick={() => onRemovePhoto(photo.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (field.type === "location") {
    return (
      <div className="ff-field" id={`field-${field.id}`}>
        <label>
          {field.label}
          {requiredMark}
        </label>
        <select
          className="ff-input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(field.id, e.target.value)}
        >
          <option value="">Select location</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.name}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "division") {
    return (
      <div className="ff-field" id={`field-${field.id}`}>
        <label>
          {field.label}
          {requiredMark}
        </label>
        <select
          className="ff-input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(field.id, e.target.value)}
        >
          <option value="">Select division</option>
          {divisions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "department") {
    return (
      <div className="ff-field" id={`field-${field.id}`}>
        <label>
          {field.label}
          {requiredMark}
        </label>
        <select
          className="ff-input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(field.id, e.target.value)}
        >
          <option value="">Select department</option>
          {departments.map((dep) => (
            <option key={dep.id} value={dep.name}>
              {dep.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "select" || field.type === "radio") {
    const options = field.options ?? [];
    return (
      <div className="ff-field" id={`field-${field.id}`}>
        <label>
          {field.label}
          {requiredMark}
        </label>
        <select
          className="ff-input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(field.id, e.target.value)}
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="ff-field" id={`field-${field.id}`}>
        <label>
          {field.label}
          {requiredMark}
        </label>
        <textarea
          className="ff-input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      </div>
    );
  }

  if (!isAnswerableField(field)) return null;

  const inputType =
    field.type === "number"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "email"
          ? "email"
          : field.type === "tel"
            ? "tel"
            : "text";

  return (
    <div className="ff-field" id={`field-${field.id}`}>
      <label>
        {field.label}
        {requiredMark}
      </label>
      <input
        className="ff-input"
        type={inputType}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    </div>
  );
}
