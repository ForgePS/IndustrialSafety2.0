"use client";

import { SignaturePad } from "@/components/signature-pad";
import {
  MEDICAL_REFUSAL_CONFIRMATION_OPTIONS,
  MEDICAL_REFUSAL_DECISION_OPTIONS,
  MEDICAL_REFUSAL_EMERGENCY_NOTICE,
  MEDICAL_REFUSAL_EMPLOYEE_STATEMENT,
  MEDICAL_REFUSAL_INTRO,
  MEDICAL_REFUSAL_WITNESS_STATEMENT,
  MEDICAL_SERVICES_OFFERED_OPTIONS,
  type MedicalRefusalAcknowledgment,
  type MedicalRefusalConfirmationId,
  type MedicalServiceOfferedId,
} from "@/lib/medical-refusal-acknowledgment";

type Props = {
  value: MedicalRefusalAcknowledgment;
  onChange: (next: MedicalRefusalAcknowledgment) => void;
  disabled?: boolean;
};

function toggleService(
  list: MedicalServiceOfferedId[],
  id: MedicalServiceOfferedId,
  checked: boolean,
): MedicalServiceOfferedId[] {
  if (checked) return list.includes(id) ? list : [...list, id];
  return list.filter((item) => item !== id);
}

/** Medical Evaluation / Treatment Refusal Acknowledgment fields. */
export function MedicalRefusalAcknowledgmentForm({ value, onChange, disabled = false }: Props) {
  function patch(partial: Partial<MedicalRefusalAcknowledgment>) {
    onChange({ ...value, ...partial });
  }

  function setConfirmation(id: MedicalRefusalConfirmationId, checked: boolean) {
    patch({
      confirmations: {
        ...value.confirmations,
        [id]: checked,
      },
    });
  }

  return (
    <div className="medical-refusal-ack">
      <div className="mb-3">
        {MEDICAL_REFUSAL_INTRO.map((paragraph) => (
          <p key={paragraph.slice(0, 48)} className="small mb-2">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mb-4">
        <div className="fw-semibold mb-2">By signing below, I confirm that:</div>
        <div className="d-flex flex-column gap-2">
          {MEDICAL_REFUSAL_CONFIRMATION_OPTIONS.map((opt) => (
            <label key={opt.id} className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                checked={value.confirmations[opt.id]}
                disabled={disabled}
                onChange={(e) => setConfirmation(opt.id, e.target.checked)}
              />
              <span className="form-check-label">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="fw-semibold mb-2">Medical Services Offered</div>
        <div className="d-flex flex-column gap-2">
          {MEDICAL_SERVICES_OFFERED_OPTIONS.map((opt) => (
            <div key={opt.id} className="d-flex flex-wrap align-items-center gap-2">
              <label className="form-check mb-0">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={value.servicesOffered.includes(opt.id)}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({
                      servicesOffered: toggleService(
                        value.servicesOffered,
                        opt.id,
                        e.target.checked,
                      ),
                    })
                  }
                />
                <span className="form-check-label">{opt.label}</span>
              </label>
              {opt.id === "other" && value.servicesOffered.includes("other") ? (
                <input
                  className="form-control form-control-sm"
                  style={{ maxWidth: 320 }}
                  placeholder="Describe other service"
                  value={value.servicesOther}
                  disabled={disabled}
                  onChange={(e) => patch({ servicesOther: e.target.value })}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="fw-semibold mb-2">Employee Decision</div>
        <div className="d-flex flex-column gap-2">
          {MEDICAL_REFUSAL_DECISION_OPTIONS.map((opt) => (
            <div key={opt.id} className="d-flex flex-wrap align-items-center gap-2">
              <label className="form-check mb-0">
                <input
                  type="radio"
                  className="form-check-input"
                  name="medical-refusal-decision"
                  checked={value.employeeDecision === opt.id}
                  disabled={disabled}
                  onChange={() => patch({ employeeDecision: opt.id })}
                />
                <span className="form-check-label">{opt.label}</span>
              </label>
              {opt.id === "other" && value.employeeDecision === "other" ? (
                <input
                  className="form-control form-control-sm"
                  style={{ maxWidth: 320 }}
                  placeholder="Describe decision"
                  value={value.employeeDecisionOther}
                  disabled={disabled}
                  onChange={(e) => patch({ employeeDecisionOther: e.target.value })}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="fw-semibold mb-2">Employee Statement</div>
        <p className="small mb-2">{MEDICAL_REFUSAL_EMPLOYEE_STATEMENT}</p>
        <label className="form-check mb-3">
          <input
            type="checkbox"
            className="form-check-input"
            checked={value.employeeStatementAck}
            disabled={disabled}
            onChange={(e) => patch({ employeeStatementAck: e.target.checked })}
          />
          <span className="form-check-label">
            Employee acknowledges and agrees with the statement above.
          </span>
        </label>
        <div className="row g-3">
          <div className="col-md-8">
            <SignaturePad
              label="Employee signature"
              value={value.employeeSignature}
              disabled={disabled}
              onChange={(employeeSignature) => patch({ employeeSignature })}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="medical-refusal-employee-signed-at">
              Date / time
            </label>
            <input
              id="medical-refusal-employee-signed-at"
              type="datetime-local"
              className="form-control"
              value={value.employeeSignedAt}
              disabled={disabled}
              onChange={(e) => patch({ employeeSignedAt: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="fw-semibold mb-2">Company Representative / Witness</div>
        <p className="small mb-3">{MEDICAL_REFUSAL_WITNESS_STATEMENT}</p>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="medical-refusal-witness-name">
              Representative / witness name
            </label>
            <input
              id="medical-refusal-witness-name"
              className="form-control"
              value={value.witnessName}
              disabled={disabled}
              onChange={(e) => patch({ witnessName: e.target.value })}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="medical-refusal-witness-title">
              Title
            </label>
            <input
              id="medical-refusal-witness-title"
              className="form-control"
              value={value.witnessTitle}
              disabled={disabled}
              onChange={(e) => patch({ witnessTitle: e.target.value })}
            />
          </div>
        </div>
        <div className="row g-3">
          <div className="col-md-8">
            <SignaturePad
              label="Representative / witness signature"
              value={value.witnessSignature}
              disabled={disabled}
              onChange={(witnessSignature) => patch({ witnessSignature })}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="medical-refusal-witness-signed-at">
              Date / time
            </label>
            <input
              id="medical-refusal-witness-signed-at"
              type="datetime-local"
              className="form-control"
              value={value.witnessSignedAt}
              disabled={disabled}
              onChange={(e) => patch({ witnessSignedAt: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label fw-semibold" htmlFor="medical-refusal-comments">
          Additional comments / observations
        </label>
        <textarea
          id="medical-refusal-comments"
          className="form-control"
          rows={3}
          value={value.additionalComments}
          disabled={disabled}
          onChange={(e) => patch({ additionalComments: e.target.value })}
        />
      </div>

      <div className="alert alert-warning small mb-0" role="note">
        {MEDICAL_REFUSAL_EMERGENCY_NOTICE}
      </div>
    </div>
  );
}
