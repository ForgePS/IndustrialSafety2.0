"use client";

import type { WorkersCompAccommodations } from "@/lib/wc-restrictions-accommodations";
import {
  WC_INJURY_PART_OPTIONS,
  WC_INJURY_SIDE_OPTIONS,
  WC_LIFTING_OPTIONS,
  WC_LOWER_EXTREMITY_OPTIONS,
  WC_SIT_OPTIONS,
  WC_STAND_WALK_OPTIONS,
  WC_TRANSITIONAL_HOUR_OPTIONS,
  WC_UPPER_EXTREMITY_OPTIONS,
} from "@/lib/wc-restrictions-accommodations";

type Props = {
  value: WorkersCompAccommodations;
  onChange: (next: WorkersCompAccommodations) => void;
  disabled?: boolean;
  /** Prefix radio `name` / control ids when the form appears more than once on a page. */
  namePrefix?: string;
};

function toggleInList<T extends string>(list: T[], id: T, checked: boolean): T[] {
  if (checked) return list.includes(id) ? list : [...list, id];
  return list.filter((item) => item !== id);
}

/** Structured Restrictions / Work Accommodations form for a WC case. */
export function WorkersCompRestrictionsForm({
  value,
  onChange,
  disabled = false,
  namePrefix = "wc",
}: Props) {
  function patch(partial: Partial<WorkersCompAccommodations>) {
    onChange({ ...value, ...partial });
  }

  const radio = (suffix: string) => `${namePrefix}-${suffix}`;

  return (
    <div className="wc-restrictions-form">
      <p className="small text-muted mb-3">
        During the workday, injured worker may: (notate all pertinent instructions for restrictions,
        including Part A, B &amp; C as applicable.)
      </p>

      <div className="mb-4">
        <div className="fw-semibold mb-2">Stand / Walk</div>
        <div className="d-flex flex-wrap gap-3">
          {WC_STAND_WALK_OPTIONS.map((opt) => (
            <label key={opt.id} className="form-check">
              <input
                type="radio"
                className="form-check-input"
                name={radio("stand-walk")}
                checked={value.standWalk === opt.id}
                disabled={disabled}
                onChange={() => patch({ standWalk: opt.id })}
              />
              <span className="form-check-label">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="fw-semibold mb-2">Sit</div>
        <div className="d-flex flex-wrap gap-3">
          {WC_SIT_OPTIONS.map((opt) => (
            <label key={opt.id} className="form-check">
              <input
                type="radio"
                className="form-check-input"
                name={radio("sit")}
                checked={value.sit === opt.id}
                disabled={disabled}
                onChange={() => patch({ sit: opt.id })}
              />
              <span className="form-check-label">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="fw-semibold mb-1">Part A: Lifting/Carrying Restrictions</div>
        <div className="small text-muted mb-2">
          (Occasionally: up to 1/3 of work day, frequently: up to 2/3 of work day)
        </div>
        <div className="d-flex flex-column gap-2">
          {WC_LIFTING_OPTIONS.map((opt) => (
            // eslint-disable-next-line jsx-a11y/label-has-associated-control -- wraps its radio; text is in nested spans deeper than the rule scans
            <label key={opt.id} className="form-check">
              <input
                type="radio"
                className="form-check-input"
                name={radio("lifting")}
                checked={value.liftingLevel === opt.id}
                disabled={disabled}
                onChange={() => patch({ liftingLevel: opt.id })}
              />
              <span className="form-check-label">
                <span className="fw-medium">{opt.label}</span>
                <span className="text-muted"> — {opt.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="fw-semibold mb-2">Part B: Other/Additional Restrictions</div>
        <div className="mb-3">
          <div className="small text-uppercase text-muted mb-2">Location of Injury</div>
          <div className="d-flex flex-wrap gap-3 align-items-center">
            {WC_INJURY_SIDE_OPTIONS.map((opt) => (
              <label key={opt.id} className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={value.injurySides.includes(opt.id)}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({
                      injurySides: toggleInList(value.injurySides, opt.id, e.target.checked),
                    })
                  }
                />
                <span className="form-check-label">{opt.label}</span>
              </label>
            ))}
            {WC_INJURY_PART_OPTIONS.map((opt) => (
              <label key={opt.id} className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={value.injuryParts.includes(opt.id)}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({
                      injuryParts: toggleInList(value.injuryParts, opt.id, e.target.checked),
                    })
                  }
                />
                <span className="form-check-label">{opt.label}</span>
              </label>
            ))}
            {value.injuryParts.includes("other") ? (
              <input
                className="form-control form-control-sm"
                style={{ maxWidth: 220 }}
                placeholder="Other location"
                value={value.injuryOther}
                disabled={disabled}
                onChange={(e) => patch({ injuryOther: e.target.value })}
              />
            ) : null}
          </div>
        </div>

        <div className="mb-3">
          <div className="small text-uppercase text-muted mb-2">Upper Extremities</div>
          <div className="d-flex flex-column gap-2">
            {WC_UPPER_EXTREMITY_OPTIONS.map((opt) => (
              <div key={opt.id} className="d-flex flex-wrap align-items-center gap-2">
                <label className="form-check mb-0">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={value.upperExtremities.includes(opt.id)}
                    disabled={disabled}
                    onChange={(e) =>
                      patch({
                        upperExtremities: toggleInList(
                          value.upperExtremities,
                          opt.id,
                          e.target.checked,
                        ),
                      })
                    }
                  />
                  <span className="form-check-label">
                    {opt.id === "limit-push-pull" ? "Limiting Push/Pull activities to" : opt.label}
                  </span>
                </label>
                {opt.id === "limit-push-pull" ? (
                  <>
                    <input
                      className="form-control form-control-sm"
                      style={{ width: 90 }}
                      inputMode="numeric"
                      value={value.pushPullLimitLbs}
                      disabled={disabled || !value.upperExtremities.includes("limit-push-pull")}
                      onChange={(e) => patch({ pushPullLimitLbs: e.target.value })}
                    />
                    <span className="small text-muted">lbs. and under</span>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="small text-uppercase text-muted mb-2">Lower Extremities</div>
          <div className="d-flex flex-column gap-2">
            {WC_LOWER_EXTREMITY_OPTIONS.map((opt) => (
              <label key={opt.id} className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={value.lowerExtremities.includes(opt.id)}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({
                      lowerExtremities: toggleInList(
                        value.lowerExtremities,
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
      </div>

      <div className="mb-4">
        <div className="fw-semibold mb-2">Part C: Transitional Work</div>
        <label className="form-check mb-3">
          <input
            type="checkbox"
            className="form-check-input"
            checked={value.transitionalNotApplicable}
            disabled={disabled}
            onChange={(e) =>
              patch({
                transitionalNotApplicable: e.target.checked,
                ...(e.target.checked
                  ? {
                      transitionalHours: "",
                      transitionalWeeks: "",
                      transitionalAbleRemaining: "",
                      transitionalEffectiveDate: "",
                    }
                  : {}),
              })
            }
          />
          <span className="form-check-label">Not Applicable — Does not apply at this time.</span>
        </label>

        {!value.transitionalNotApplicable ? (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">Unrestricted work per day</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Able to work remaining daily schedule under Restrictions?</th>
                  <th scope="col">Effective Date</th>
                </tr>
              </thead>
              <tbody>
                {WC_TRANSITIONAL_HOUR_OPTIONS.map((opt) => {
                  const selected = value.transitionalHours === opt.id;
                  return (
                    <tr key={opt.id}>
                      <td>
                        <label className="form-check mb-0">
                          <input
                            type="radio"
                            className="form-check-input"
                            name={radio("transitional-hours")}
                            checked={selected}
                            disabled={disabled}
                            onChange={() => patch({ transitionalHours: opt.id })}
                          />
                          <span className="form-check-label">
                            {opt.label} of Unrestricted work per day for
                          </span>
                        </label>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-1">
                          <input
                            className="form-control form-control-sm"
                            style={{ width: 70 }}
                            value={selected ? value.transitionalWeeks : ""}
                            disabled={disabled || !selected}
                            onChange={(e) => patch({ transitionalWeeks: e.target.value })}
                          />
                          <span className="small text-muted">week(s)</span>
                        </div>
                      </td>
                      <td>
                        <div className="d-flex gap-3">
                          {(["yes", "no"] as const).map((answer) => (
                            <label key={answer} className="form-check mb-0">
                              <input
                                type="radio"
                                className="form-check-input"
                                name={radio(`transitional-able-${opt.id}`)}
                                checked={selected && value.transitionalAbleRemaining === answer}
                                disabled={disabled || !selected}
                                onChange={() => patch({ transitionalAbleRemaining: answer })}
                              />
                              <span className="form-check-label text-uppercase">{answer}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                      <td>
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={selected ? value.transitionalEffectiveDate : ""}
                          disabled={disabled || !selected}
                          onChange={(e) => patch({ transitionalEffectiveDate: e.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div>
        <label className="form-label fw-semibold" htmlFor={radio("restriction-notes")}>
          Notes (or Other Functional Limitations or Modifications necessary in the Injured Workers
          Employment)
        </label>
        <textarea
          id={radio("restriction-notes")}
          className="form-control"
          rows={3}
          value={value.notes}
          disabled={disabled}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}
