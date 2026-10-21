"use client";

import { SignaturePad } from "@/components/signature-pad";
import {
  REASONABLE_SUSPICION_INDICATOR_GROUPS,
  REASONABLE_SUSPICION_TRANSPORT_OPTIONS,
  reasonableSuspicionTestDeadlines,
  type ReasonableSuspicionIndicatorId,
  type ReasonableSuspicionObservation,
  type ReasonableSuspicionTransportId,
} from "@/lib/reasonable-suspicion";

type Props = {
  value: ReasonableSuspicionObservation;
  onChange: (next: ReasonableSuspicionObservation) => void;
  disabled?: boolean;
};

function toggleIndicator(
  list: ReasonableSuspicionIndicatorId[],
  id: ReasonableSuspicionIndicatorId,
  checked: boolean,
): ReasonableSuspicionIndicatorId[] {
  if (checked) return list.includes(id) ? list : [...list, id];
  return list.filter((item) => item !== id);
}

function formatDeadline(value: string): string {
  const [date = "", time = ""] = value.split("T");
  return `${date} ${time}`.trim();
}

/** Supervisor's reasonable-suspicion observation record (Incidents → Drug/Alcohol). */
export function ReasonableSuspicionForm({ value, onChange, disabled = false }: Props) {
  function patch(partial: Partial<ReasonableSuspicionObservation>) {
    onChange({ ...value, ...partial });
  }

  const deadlines = reasonableSuspicionTestDeadlines(value.observedAt);

  return (
    <div className="reasonable-suspicion">
      <p className="small text-muted mb-3">
        Record only what you personally saw, heard, or smelled, as it happened. Reasonable
        suspicion must be based on specific, current observations of the employee&apos;s
        appearance, behavior, speech, or body odor.
      </p>

      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <label className="form-label" htmlFor="rs-observed-at">
            Observed date / time <span className="text-danger">*</span>
          </label>
          <input
            id="rs-observed-at"
            type="datetime-local"
            className="form-control"
            value={value.observedAt.slice(0, 16)}
            disabled={disabled}
            onChange={(e) => patch({ observedAt: e.target.value })}
          />
        </div>
        <div className="col-md-8">
          <div className="form-label">
            DOT-covered driver? <span className="text-danger">*</span>
          </div>
          <div className="d-flex flex-wrap gap-3">
            {[
              { id: "yes", label: "Yes - DOT rules apply", flag: true },
              { id: "no", label: "No - company policy", flag: false },
            ].map((opt) => (
              <label key={opt.id} className="form-check mb-0">
                <input
                  type="radio"
                  name="rs-dot-covered"
                  className="form-check-input"
                  checked={value.dotCovered === opt.flag}
                  disabled={disabled}
                  onChange={() => patch({ dotCovered: opt.flag })}
                />
                <span className="form-check-label">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {deadlines ? (
        <div className="alert alert-info small py-2" role="note">
          <strong>Testing windows:</strong> alcohol test by {formatDeadline(deadlines.alcoholBy)}{" "}
          (2 hours; stop trying after {formatDeadline(deadlines.alcoholCutoff)}) · drug test by{" "}
          {formatDeadline(deadlines.drugBy)} (32 hours). Document the reason if a test is late or
          not done.
        </div>
      ) : null}

      {value.dotCovered && !value.observerTrained ? (
        <div className="alert alert-warning small py-2" role="note">
          DOT reasonable-suspicion testing must be ordered by a supervisor who has completed
          reasonable-suspicion training (49 CFR 382.307 and 382.603).
        </div>
      ) : null}

      <div className="mb-4">
        <div className="fw-semibold mb-2">
          Observed signs <span className="text-danger">*</span>
        </div>
        <div className="row g-3">
          {REASONABLE_SUSPICION_INDICATOR_GROUPS.map((group) => (
            <div key={group.id} className="col-md-6 col-xl-4">
              <div className="small text-muted text-uppercase mb-1">{group.label}</div>
              <div className="d-flex flex-column gap-1">
                {group.options.map((opt) => (
                  <label key={opt.id} className="form-check mb-0">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={value.indicators.includes(opt.id)}
                      disabled={disabled}
                      onChange={(e) =>
                        patch({
                          indicators: toggleIndicator(value.indicators, opt.id, e.target.checked),
                        })
                      }
                    />
                    <span className="form-check-label">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className="form-label" htmlFor="rs-indicators-other">
            Other signs
          </label>
          <input
            id="rs-indicators-other"
            className="form-control"
            value={value.indicatorsOther}
            disabled={disabled}
            onChange={(e) => patch({ indicatorsOther: e.target.value })}
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="form-label fw-semibold" htmlFor="rs-narrative">
          What did you observe? <span className="text-danger">*</span>
        </label>
        <textarea
          id="rs-narrative"
          className="form-control"
          rows={4}
          placeholder="Who, what, when, and where. Describe exactly what you saw, heard, or smelled."
          value={value.observationNarrative}
          disabled={disabled}
          onChange={(e) => patch({ observationNarrative: e.target.value })}
        />
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <label className="form-label" htmlFor="rs-observer-name">
            Observing supervisor <span className="text-danger">*</span>
          </label>
          <input
            id="rs-observer-name"
            className="form-control mb-2"
            value={value.observerName}
            disabled={disabled}
            onChange={(e) => patch({ observerName: e.target.value })}
          />
          <label className="form-label" htmlFor="rs-observer-title">
            Title
          </label>
          <input
            id="rs-observer-title"
            className="form-control mb-2"
            value={value.observerTitle}
            disabled={disabled}
            onChange={(e) => patch({ observerTitle: e.target.value })}
          />
          <label className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              checked={value.observerTrained}
              disabled={disabled}
              onChange={(e) => patch({ observerTrained: e.target.checked })}
            />
            <span className="form-check-label">
              Supervisor has completed reasonable-suspicion training
            </span>
          </label>
        </div>
        <div className="col-md-6">
          <SignaturePad
            label="Supervisor signature"
            value={value.observerSignature}
            disabled={disabled}
            onChange={(observerSignature) => patch({ observerSignature })}
          />
          <label className="form-label mt-2" htmlFor="rs-observer-signed-at">
            Signed date / time
          </label>
          <input
            id="rs-observer-signed-at"
            type="datetime-local"
            className="form-control"
            value={value.observerSignedAt.slice(0, 16)}
            disabled={disabled}
            onChange={(e) => patch({ observerSignedAt: e.target.value })}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="rs-second-observer-name">
            Second observer (recommended)
          </label>
          <input
            id="rs-second-observer-name"
            className="form-control mb-2"
            value={value.secondObserverName}
            disabled={disabled}
            onChange={(e) => patch({ secondObserverName: e.target.value })}
          />
          <label className="form-label" htmlFor="rs-second-observer-title">
            Title
          </label>
          <input
            id="rs-second-observer-title"
            className="form-control"
            value={value.secondObserverTitle}
            disabled={disabled}
            onChange={(e) => patch({ secondObserverTitle: e.target.value })}
          />
        </div>
        <div className="col-md-6">
          <SignaturePad
            label="Second observer signature"
            value={value.secondObserverSignature}
            disabled={disabled}
            onChange={(secondObserverSignature) => patch({ secondObserverSignature })}
          />
        </div>
      </div>

      <div className="fw-semibold mb-2">Removal from duty and transportation</div>
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <label className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              checked={value.removedFromDuty}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  removedFromDuty: e.target.checked,
                  ...(e.target.checked ? {} : { removedFromDutyAt: "" }),
                })
              }
            />
            <span className="form-check-label">Employee removed from safety-sensitive duty</span>
          </label>
          {value.removedFromDuty ? (
            <input
              id="rs-removed-at"
              type="datetime-local"
              className="form-control mt-2"
              aria-label="Removed from duty date / time"
              value={value.removedFromDutyAt.slice(0, 16)}
              disabled={disabled}
              onChange={(e) => patch({ removedFromDutyAt: e.target.value })}
            />
          ) : null}
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="rs-transportation">
            Transportation (employee must not drive)
          </label>
          <select
            id="rs-transportation"
            className="form-select"
            value={value.transportation}
            disabled={disabled}
            onChange={(e) =>
              patch({ transportation: e.target.value as ReasonableSuspicionTransportId })
            }
          >
            <option value="">Select…</option>
            {REASONABLE_SUSPICION_TRANSPORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          {value.transportation === "other" ? (
            <input
              className="form-control mt-2"
              aria-label="Other transportation"
              placeholder="Describe transportation"
              value={value.transportationOther}
              disabled={disabled}
              onChange={(e) => patch({ transportationOther: e.target.value })}
            />
          ) : null}
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="rs-employee-statement">
            Employee statement / explanation
          </label>
          <textarea
            id="rs-employee-statement"
            className="form-control"
            rows={3}
            placeholder="What the employee said when asked about the observations (medications, illness, etc.)"
            value={value.employeeStatement}
            disabled={disabled}
            onChange={(e) => patch({ employeeStatement: e.target.value })}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="rs-follow-up">
            Follow-up / outcome
          </label>
          <textarea
            id="rs-follow-up"
            className="form-control"
            rows={3}
            placeholder="Suspended pending results, return-to-duty steps, referral to EAP, etc."
            value={value.followUpNotes}
            disabled={disabled}
            onChange={(e) => patch({ followUpNotes: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
