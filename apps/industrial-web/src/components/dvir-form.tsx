"use client";

import { type FormEvent } from "react";
import { SignaturePad } from "@/components/signature-pad";
import {
  DVIR_SAFETY_ITEMS,
  DVIR_TRAILER_ITEMS,
  DVIR_TRUCK_ITEMS,
  dvirDefectCountFromItems,
  setDvirItemAnswer,
  setDvirItemNotes,
  type DvirAnswerValue,
  type DvirFormState,
  type DvirItemAnswer,
  type DvirTripType,
} from "@/lib/dvir";

function ChecklistSection({
  title,
  itemIds,
  items,
  onAnswer,
  onNotes,
  disabled,
}: {
  title: string;
  itemIds: ReadonlyArray<string>;
  items: DvirItemAnswer[];
  onAnswer: (id: string, answer: DvirAnswerValue) => void;
  onNotes: (id: string, notes: string) => void;
  disabled?: boolean;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <fieldset className="mb-4" disabled={disabled}>
      <legend className="form-label fw-semibold mb-2">{title}</legend>
      <p className="text-muted small mb-3">
        Answer Yes, No, or N/A for every item. No requires a note.
      </p>
      <div className="d-flex flex-column gap-3">
        {itemIds.map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          const showNotes = item.answer === "NO";
          return (
            <div
              key={id}
              className={`dvir-checklist-item border rounded p-3 ${item.answer === "NO" ? "border-danger bg-label-danger bg-opacity-10" : ""}`}
            >
              <div className="dvir-checklist-item__header">
                <span className="dvir-checklist-item__label fw-medium">{item.label}</span>
                <div
                  className="btn-group dvir-checklist-item__answers"
                  role="group"
                  aria-label={`${item.label} answer`}
                >
                  {(["YES", "NO", "NA"] as const).map((answer) => (
                    <button
                      key={answer}
                      type="button"
                      className={`btn btn-sm ${
                        answer === "NO"
                          ? item.answer === answer
                            ? "btn-danger"
                            : "btn-outline-danger"
                          : item.answer === answer
                            ? answer === "YES"
                              ? "btn-success"
                              : "btn-secondary"
                            : "btn-outline-secondary"
                      }`}
                      onClick={() => onAnswer(id, answer)}
                    >
                      {answer === "YES" ? "Yes" : answer === "NO" ? "No" : "N/A"}
                    </button>
                  ))}
                </div>
              </div>
              {showNotes ? (
                <div className="mt-2">
                  <label className="form-label small" htmlFor={`dvir-note-${id}`}>
                    Note required *
                  </label>
                  <textarea
                    id={`dvir-note-${id}`}
                    className="form-control form-control-sm"
                    rows={2}
                    required
                    value={item.notes}
                    onChange={(ev) => onNotes(id, ev.target.value)}
                    placeholder="Describe the defect or issue"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function DvirForm({
  value,
  onChange,
  onSubmit,
  submitting,
  submitLabel = "Submit DVIR",
  lockVehicleFields,
  lockTripType,
  error,
}: {
  value: DvirFormState;
  onChange: (next: DvirFormState) => void;
  onSubmit: (event: FormEvent) => void;
  submitting?: boolean;
  submitLabel?: string;
  lockVehicleFields?: boolean;
  lockTripType?: boolean;
  error?: string | null;
}) {
  const noCount = dvirDefectCountFromItems(value.items);
  const hasDefects = noCount > 0;

  function set<K extends keyof DvirFormState>(key: K, next: DvirFormState[K]) {
    onChange({ ...value, [key]: next });
  }

  function onTripChange(tripType: DvirTripType) {
    onChange({ ...value, tripType });
  }

  function onAnswer(id: string, answer: DvirAnswerValue) {
    const items = setDvirItemAnswer(value.items, id, answer);
    const defects = dvirDefectCountFromItems(items);
    onChange({
      ...value,
      items,
      conditionSatisfactory: defects === 0 ? value.conditionSatisfactory : false,
    });
  }

  function onNotes(id: string, notes: string) {
    onChange({ ...value, items: setDvirItemNotes(value.items, id, notes) });
  }

  return (
    <form onSubmit={onSubmit} className="dvir-form">
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="row g-3 mb-4">
        <div className="col-12">
          <span className="form-label d-block">Inspection type *</span>
          {lockTripType ? (
            <p className="mb-0 fw-semibold">
              {value.tripType === "POST_TRIP" ? "Post-trip" : "Pre-trip"}
            </p>
          ) : (
            <div className="btn-group w-100" role="group" aria-label="Trip type">
              <button
                type="button"
                className={`btn ${value.tripType === "PRE_TRIP" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => onTripChange("PRE_TRIP")}
              >
                Pre-trip
              </button>
              <button
                type="button"
                className={`btn ${value.tripType === "POST_TRIP" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => onTripChange("POST_TRIP")}
              >
                Post-trip
              </button>
            </div>
          )}
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="dvir-date">
            Date *
          </label>
          <input
            id="dvir-date"
            type="date"
            className="form-control"
            required
            value={value.inspectionDate}
            onChange={(ev) => set("inspectionDate", ev.target.value)}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="dvir-truck">
            Truck / tractor no. *
          </label>
          <input
            id="dvir-truck"
            className="form-control"
            required
            readOnly={lockVehicleFields}
            value={value.truckNumber}
            onChange={(ev) => set("truckNumber", ev.target.value)}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="dvir-trailer">
            Trailer no(s).
          </label>
          <input
            id="dvir-trailer"
            className="form-control"
            value={value.trailerNumbers}
            onChange={(ev) => set("trailerNumbers", ev.target.value)}
          />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="dvir-driver">
            DRIVER name *
          </label>
          <input
            id="dvir-driver"
            className="form-control"
            required
            autoComplete="name"
            value={value.workerName}
            onChange={(ev) => set("workerName", ev.target.value)}
          />
        </div>
      </div>

      <ChecklistSection
        title="Truck / tractor"
        itemIds={DVIR_TRUCK_ITEMS.map((i) => i.id)}
        items={value.items}
        onAnswer={onAnswer}
        onNotes={onNotes}
      />
      <ChecklistSection
        title="Emergency equipment"
        itemIds={DVIR_SAFETY_ITEMS.map((i) => i.id)}
        items={value.items}
        onAnswer={onAnswer}
        onNotes={onNotes}
      />
      <ChecklistSection
        title="Trailer(s)"
        itemIds={DVIR_TRAILER_ITEMS.map((i) => i.id)}
        items={value.items}
        onAnswer={onAnswer}
        onNotes={onNotes}
      />

      <div className="mb-4">
        <label className="form-label" htmlFor="dvir-remarks">
          Additional remarks
        </label>
        <textarea
          id="dvir-remarks"
          className="form-control"
          rows={2}
          value={value.remarks}
          onChange={(ev) => set("remarks", ev.target.value)}
          placeholder="Optional overall comments"
        />
      </div>

      <div className="form-check mb-4">
        <input
          id="dvir-satisfactory"
          type="checkbox"
          className="form-check-input"
          checked={value.conditionSatisfactory && !hasDefects}
          disabled={hasDefects}
          onChange={(ev) => set("conditionSatisfactory", ev.target.checked)}
        />
        <label className="form-check-label" htmlFor="dvir-satisfactory">
          Condition of the above vehicle is satisfactory
        </label>
      </div>

      <div className="mb-4">
        <SignaturePad
          label="DRIVER signature *"
          value={value.driverSignatureDataUrl}
          onChange={(dataUrl) => set("driverSignatureDataUrl", dataUrl)}
          signatureDate={value.driverSignatureDate}
          onSignatureDateChange={(date) => set("driverSignatureDate", date)}
        />
      </div>

      <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
        {submitting ? "Submitting…" : submitLabel}
      </button>
    </form>
  );
}
