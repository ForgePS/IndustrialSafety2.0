"use client";

import { PersonnelSearchField } from "@/components/personnel-search-field";
import { SignaturePad } from "@/components/signature-pad";
import {
  DRUG_ALCOHOL_CONSENT_INTRO,
  DRUG_ALCOHOL_CONSENT_OPTIONS,
  DRUG_ALCOHOL_REASON_OPTIONS,
  DRUG_ALCOHOL_SUBSTANCE_OPTIONS,
  DRUG_ALCOHOL_TEST_STATUS_OPTIONS,
  newDrugAlcoholConsent,
  type DrugAlcoholConsentId,
  type DrugAlcoholIncidentSection,
  type DrugAlcoholReasonId,
  type DrugAlcoholSubstanceId,
} from "@/lib/drug-alcohol-incident";

type Props = {
  value: DrugAlcoholIncidentSection;
  onChange: (next: DrugAlcoholIncidentSection) => void;
  disabled?: boolean;
  /** Prefix for element ids; must be unique per form on the page. */
  idPrefix?: string;
};

function toggleSubstance(
  list: DrugAlcoholSubstanceId[],
  id: DrugAlcoholSubstanceId,
  checked: boolean,
): DrugAlcoholSubstanceId[] {
  if (checked) return list.includes(id) ? list : [...list, id];
  return list.filter((item) => item !== id);
}

/** Drug & alcohol consent + test documentation for one employee on an incident report. */
export function DrugAlcoholIncidentForm({
  value,
  onChange,
  disabled = false,
  idPrefix = "incident-da",
}: Props) {
  const fieldId = (suffix: string) => `${idPrefix}-${suffix}`;

  function patch(partial: Partial<DrugAlcoholIncidentSection>) {
    onChange({ ...value, ...partial });
  }

  function setConsent(id: DrugAlcoholConsentId, checked: boolean) {
    patch({
      consent: {
        ...value.consent,
        [id]: checked,
      },
    });
  }

  return (
    <div className="drug-alcohol-incident">
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <PersonnelSearchField
            id={fieldId("employee")}
            label="Employee"
            required
            hint="Search Employee Profiles by last name or EMPLOYEE #, or type a name."
            personnelId={value.personnelId}
            displayName={value.employeeName}
            disabled={disabled}
            allowUnlinkedText
            onLinkedChange={(selection) =>
              patch(
                selection
                  ? { personnelId: selection.personnelId, employeeName: selection.displayName }
                  : { personnelId: "", employeeName: "" },
              )
            }
            onUnlinkedTextChange={(employeeName) => patch({ personnelId: "", employeeName })}
          />
        </div>
      </div>

      <div className="form-check mb-3">
        <input
          id={fieldId("required")}
          type="checkbox"
          className="form-check-input"
          checked={value.testingRequired}
          disabled={disabled}
          onChange={(e) => patch({ testingRequired: e.target.checked })}
        />
        <label className="form-check-label" htmlFor={fieldId("required")}>
          Drug and/or alcohol testing required for this employee
        </label>
      </div>

      {!value.testingRequired ? (
        <p className="text-muted small mb-0">
          Check the box above when post-accident or other required testing applies. Consent and
          test details will appear here.
        </p>
      ) : (
        <>
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label" htmlFor={fieldId("reason")}>
                Reason for testing
              </label>
              <select
                id={fieldId("reason")}
                className="form-select"
                value={value.reason}
                disabled={disabled}
                onChange={(e) =>
                  patch({
                    reason: e.target.value as DrugAlcoholIncidentSection["reason"],
                  })
                }
              >
                <option value="">Select…</option>
                {DRUG_ALCOHOL_REASON_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {value.reason === "other" ? (
              <div className="col-md-6">
                <label className="form-label" htmlFor={fieldId("reason-other")}>
                  Other reason
                </label>
                <input
                  id={fieldId("reason-other")}
                  className="form-control"
                  value={value.reasonOther}
                  disabled={disabled}
                  onChange={(e) => patch({ reasonOther: e.target.value })}
                />
              </div>
            ) : null}
          </div>

          <div className="mb-3">
            {DRUG_ALCOHOL_CONSENT_INTRO.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="small mb-2">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mb-4">
            <div className="fw-semibold mb-2">Employee consent acknowledgments</div>
            <div className="d-flex flex-column gap-2">
              {DRUG_ALCOHOL_CONSENT_OPTIONS.map((opt) => (
                <label key={opt.id} className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={value.consent[opt.id]}
                    disabled={disabled}
                    onChange={(e) => setConsent(opt.id, e.target.checked)}
                  />
                  <span className="form-check-label">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-md-8">
              <SignaturePad
                label="Employee signature"
                value={value.employeeSignature}
                disabled={disabled}
                onChange={(employeeSignature) => patch({ employeeSignature })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor={fieldId("employee-signed-at")}>
                Date / time
              </label>
              <input
                id={fieldId("employee-signed-at")}
                type="datetime-local"
                className="form-control"
                value={value.employeeSignedAt.slice(0, 16)}
                disabled={disabled}
                onChange={(e) => patch({ employeeSignedAt: e.target.value })}
              />
            </div>
            <div className="col-md-8">
              <label className="form-label" htmlFor={fieldId("witness-name")}>
                Witness name
              </label>
              <input
                id={fieldId("witness-name")}
                className="form-control mb-2"
                value={value.witnessName}
                disabled={disabled}
                onChange={(e) => patch({ witnessName: e.target.value })}
              />
              <SignaturePad
                label="Witness signature"
                value={value.witnessSignature}
                disabled={disabled}
                onChange={(witnessSignature) => patch({ witnessSignature })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor={fieldId("witness-signed-at")}>
                Witness date / time
              </label>
              <input
                id={fieldId("witness-signed-at")}
                type="datetime-local"
                className="form-control"
                value={value.witnessSignedAt.slice(0, 16)}
                disabled={disabled}
                onChange={(e) => patch({ witnessSignedAt: e.target.value })}
              />
            </div>
          </div>

          <div className="border-top pt-3">
            <div className="fw-semibold mb-2">Test details</div>
            <div className="mb-3">
              <div className="small text-muted mb-1">Substances</div>
              <div className="d-flex flex-wrap gap-3">
                {DRUG_ALCOHOL_SUBSTANCE_OPTIONS.map((opt) => (
                  <label key={opt.id} className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={value.substances.includes(opt.id)}
                      disabled={disabled}
                      onChange={(e) =>
                        patch({
                          substances: toggleSubstance(
                            value.substances,
                            opt.id,
                            e.target.checked,
                          ),
                        })
                      }
                    />
                    <span className="form-check-label">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label" htmlFor={fieldId("status")}>
                  Test status
                </label>
                <select
                  id={fieldId("status")}
                  className="form-select"
                  value={value.testStatus}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({
                      testStatus: e.target
                        .value as DrugAlcoholIncidentSection["testStatus"],
                    })
                  }
                >
                  {DRUG_ALCOHOL_TEST_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor={fieldId("site")}>
                  Collection site
                </label>
                <input
                  id={fieldId("site")}
                  className="form-control"
                  placeholder="Clinic / collector"
                  value={value.collectionSite}
                  disabled={disabled}
                  onChange={(e) => patch({ collectionSite: e.target.value })}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor={fieldId("ordered")}>
                  Ordered / scheduled
                </label>
                <input
                  id={fieldId("ordered")}
                  type="datetime-local"
                  className="form-control"
                  value={value.orderedAt.slice(0, 16)}
                  disabled={disabled}
                  onChange={(e) => patch({ orderedAt: e.target.value })}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor={fieldId("completed")}>
                  Collection completed
                </label>
                <input
                  id={fieldId("completed")}
                  type="datetime-local"
                  className="form-control"
                  value={value.completedAt.slice(0, 16)}
                  disabled={disabled}
                  onChange={(e) => patch({ completedAt: e.target.value })}
                />
              </div>
              <div className="col-md-8">
                <label className="form-label" htmlFor={fieldId("results")}>
                  Result / MRO notes
                </label>
                <input
                  id={fieldId("results")}
                  className="form-control"
                  placeholder="Pending, negative, positive, dilute, etc."
                  value={value.resultNotes}
                  disabled={disabled}
                  onChange={(e) => patch({ resultNotes: e.target.value })}
                />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor={fieldId("comments")}>
                  Additional comments
                </label>
                <textarea
                  id={fieldId("comments")}
                  className="form-control"
                  rows={2}
                  value={value.additionalComments}
                  disabled={disabled}
                  onChange={(e) => patch({ additionalComments: e.target.value })}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type ListProps = {
  value: DrugAlcoholIncidentSection[];
  onChange: (next: DrugAlcoholIncidentSection[]) => void;
  disabled?: boolean;
  /** Pre-fills the first consent form with the incident's person affected. */
  defaultEmployee?: { employeeName: string; personnelId: string };
  defaultReason?: DrugAlcoholReasonId;
};

/** One drug & alcohol consent form per employee involved in the incident. */
export function DrugAlcoholConsentList({
  value,
  onChange,
  disabled = false,
  defaultEmployee,
  defaultReason = "post-accident",
}: ListProps) {
  const alreadyListed = (name: string, personnelId: string) =>
    value.some(
      (consent) =>
        (personnelId && consent.personnelId === personnelId) ||
        (!personnelId && name && consent.employeeName.trim() === name.trim()),
    );

  function addConsent() {
    const prefill =
      defaultEmployee &&
      defaultEmployee.employeeName.trim() &&
      !alreadyListed(defaultEmployee.employeeName, defaultEmployee.personnelId)
        ? defaultEmployee
        : undefined;
    onChange([...value, { ...newDrugAlcoholConsent(prefill), reason: defaultReason }]);
  }

  function updateConsent(index: number, next: DrugAlcoholIncidentSection) {
    onChange(value.map((consent, i) => (i === index ? next : consent)));
  }

  function removeConsent(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="drug-alcohol-consent-list d-flex flex-column gap-3">
      {value.length === 0 ? (
        <p className="text-muted small mb-0">
          No drug and alcohol consent forms yet. Add one for each employee who needs testing.
        </p>
      ) : null}
      {value.map((consent, index) => (
        <div key={consent.id} className="card">
          <div className="card-header d-flex align-items-center justify-content-between gap-2">
            <span className="fw-semibold">
              Consent form {index + 1}
              {consent.employeeName.trim() ? ` - ${consent.employeeName.trim()}` : ""}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              disabled={disabled}
              onClick={() => removeConsent(index)}
            >
              Remove
            </button>
          </div>
          <div className="card-body">
            <DrugAlcoholIncidentForm
              idPrefix={`incident-da-${consent.id}`}
              value={consent}
              disabled={disabled}
              onChange={(next) => updateConsent(index, next)}
            />
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn btn-outline-primary"
          disabled={disabled}
          onClick={addConsent}
        >
          {value.length === 0 ? "Add consent form" : "Add another employee"}
        </button>
      </div>
    </div>
  );
}
