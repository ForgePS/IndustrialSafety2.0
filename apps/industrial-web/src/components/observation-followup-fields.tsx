"use client";

import { useState } from "react";
import { SignaturePad } from "@/components/signature-pad";
import { compressImageToDataUrl, imageCompressErrorMessage } from "@/lib/compress-image";
import {
  OBSERVATION_COACHING_OPTIONS,
  OBSERVATION_ROOT_CAUSE_OPTIONS,
  type ObservationFollowUp,
  type ObservationPhoto,
} from "@/lib/observations-module";

const MAX_AFTER_PHOTOS = 5;
/** Per-photo data-URL budget; keeps the public submit well under the API body limit. */
const AFTER_PHOTO_MAX_LENGTH = 1_000_000;

function newPhotoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Supervisor follow-up / close-out fields shared by the public form and the Forge editor. */
export function ObservationFollowUpFields({
  value,
  onChange,
  disabled = false,
  idPrefix,
  onError,
}: {
  value: ObservationFollowUp;
  onChange: (next: ObservationFollowUp) => void;
  disabled?: boolean;
  idPrefix: string;
  onError: (message: string | null) => void;
}) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const set = <K extends keyof ObservationFollowUp>(key: K, v: ObservationFollowUp[K]) =>
    onChange({ ...value, [key]: v });
  const rootCauses = value.rootCause && !OBSERVATION_ROOT_CAUSE_OPTIONS.includes(value.rootCause)
    ? [...OBSERVATION_ROOT_CAUSE_OPTIONS, value.rootCause]
    : OBSERVATION_ROOT_CAUSE_OPTIONS;

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_AFTER_PHOTOS - value.afterPhotos.length;
    if (room <= 0) {
      onError(`You can attach up to ${MAX_AFTER_PHOTOS} follow-up photos.`);
      return;
    }
    setPhotoBusy(true);
    onError(null);
    try {
      const added: ObservationPhoto[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        const dataUrl = await compressImageToDataUrl(file, AFTER_PHOTO_MAX_LENGTH);
        if (!dataUrl.startsWith("data:image/")) throw new Error("Only image files can be attached.");
        added.push({
          id: newPhotoId(),
          fileName: file.name || "photo.jpg",
          contentType: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg",
          dataUrl,
        });
      }
      onChange({ ...value, afterPhotos: [...value.afterPhotos, ...added] });
      if (files.length > room) {
        onError(`Only the first ${room} photo(s) were added (limit ${MAX_AFTER_PHOTOS}).`);
      }
    } catch (e) {
      onError(imageCompressErrorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <fieldset disabled={disabled}>
      <div className="row g-3 mb-3">
        <div className="col-md-5">
          <label className="form-label" htmlFor={`${idPrefix}-root-cause`}>
            Root cause
          </label>
          <select
            id={`${idPrefix}-root-cause`}
            className="form-select"
            value={value.rootCause}
            onChange={(e) => set("rootCause", e.target.value)}
          >
            <option value="">Select root cause</option>
            {rootCauses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-7">
          <label className="form-label" htmlFor={`${idPrefix}-root-cause-detail`}>
            Root cause detail
          </label>
          <input
            id={`${idPrefix}-root-cause-detail`}
            className="form-control"
            value={value.rootCauseDetail}
            onChange={(e) => set("rootCauseDetail", e.target.value)}
            placeholder="Why did this happen?"
          />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor={`${idPrefix}-corrective`}>
            Corrective action taken <span className="text-danger">*</span>
          </label>
          <textarea
            id={`${idPrefix}-corrective`}
            className="form-control"
            rows={3}
            value={value.correctiveAction}
            onChange={(e) => set("correctiveAction", e.target.value)}
            placeholder="What was done to fix it?"
          />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor={`${idPrefix}-preventive`}>
            Preventive action
          </label>
          <textarea
            id={`${idPrefix}-preventive`}
            className="form-control"
            rows={2}
            value={value.preventiveAction}
            onChange={(e) => set("preventiveAction", e.target.value)}
            placeholder="What will stop it from happening again?"
          />
        </div>
        <div className="col-md-6">
          <span className="form-label d-block">Employee coached?</span>
          <div className="btn-group" role="radiogroup" aria-label="Employee coached">
            {OBSERVATION_COACHING_OPTIONS.map((o) => {
              const selected = value.employeeCoached === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`btn btn-sm ${selected ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => set("employeeCoached", selected ? "" : o.value)}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor={`${idPrefix}-by`}>
            Supervisor name <span className="text-danger">*</span>
          </label>
          <input
            id={`${idPrefix}-by`}
            className="form-control"
            value={value.completedByName}
            onChange={(e) => set("completedByName", e.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor={`${idPrefix}-notes`}>
            Notes
          </label>
          <textarea
            id={`${idPrefix}-notes`}
            className="form-control"
            rows={2}
            value={value.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>

      <span className="form-label d-block">
        Follow-up photos ({value.afterPhotos.length}/{MAX_AFTER_PHOTOS})
      </span>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {value.afterPhotos.map((photo) => (
          <div
            key={photo.id}
            className="position-relative border rounded overflow-hidden"
            style={{ width: 96, height: 96 }}
          >
            <img src={photo.dataUrl} alt={photo.fileName} className="w-100 h-100" style={{ objectFit: "cover" }} />
            {!disabled ? (
              <button
                type="button"
                className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 px-1 py-0"
                aria-label={`Remove ${photo.fileName}`}
                onClick={() =>
                  set(
                    "afterPhotos",
                    value.afterPhotos.filter((p) => p.id !== photo.id),
                  )
                }
              >
                <i className="bx bx-x" />
              </button>
            ) : null}
          </div>
        ))}
        {!disabled && value.afterPhotos.length < MAX_AFTER_PHOTOS ? (
          <label
            className="border rounded d-flex flex-column align-items-center justify-content-center text-muted"
            style={{ width: 96, height: 96, cursor: "pointer", borderStyle: "dashed" }}
          >
            <i className="bx bx-camera fs-3" />
            <span className="small">{photoBusy ? "Adding…" : "Add photos"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="d-none"
              disabled={photoBusy}
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>

      <SignaturePad
        label="Supervisor signature *"
        value={value.signatureDataUrl}
        onChange={(dataUrl) => set("signatureDataUrl", dataUrl)}
        disabled={disabled}
        signatureDate={value.completedDate}
        onSignatureDateChange={(d) => set("completedDate", d)}
        dateLabel="Date completed *"
      />
    </fieldset>
  );
}
