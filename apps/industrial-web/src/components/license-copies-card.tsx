"use client";

import type { LicenseCopies } from "@/lib/license-copies";

type Props = {
  copies: LicenseCopies;
  personName: string;
  /** When true, show a missing-copy notice (company / DQF drivers). */
  required?: boolean;
};

/**
 * Front and back driver's license images for the personnel / DOT file.
 */
export function LicenseCopiesCard({ copies, personName, required }: Props) {
  const { front, back } = copies;
  if (!front && !back && !required) return null;

  return (
    <div className="card mb-4">
      <div className="card-header d-flex align-items-center gap-3">
        <div className="avatar avatar-sm flex-shrink-0">
          <span className="avatar-initial rounded bg-label-primary">
            <i className="bx bx-id-card" aria-hidden="true" />
          </span>
        </div>
        <div>
          <h6 className="card-title mb-0">Driver&apos;s license copies</h6>
          <p className="text-muted small mb-0">Front and back of the license for the personnel file</p>
        </div>
      </div>
      <div className="card-body">
        {!front && !back ? (
          <p className="text-warning mb-0" role="status">
            Missing front and back license copies. Add them under Edit person → Driver.
          </p>
        ) : (
          <div className="row g-3">
            <div className="col-md-6">
              <p className="text-muted small text-uppercase mb-2">Front</p>
              {front ? (
                <img
                  src={front}
                  alt={`Driver's license front for ${personName}`}
                  className="img-fluid border rounded bg-white"
                />
              ) : (
                <p className="text-warning mb-0">Front copy missing</p>
              )}
            </div>
            <div className="col-md-6">
              <p className="text-muted small text-uppercase mb-2">Back</p>
              {back ? (
                <img
                  src={back}
                  alt={`Driver's license back for ${personName}`}
                  className="img-fluid border rounded bg-white"
                />
              ) : (
                <p className="text-warning mb-0">Back copy missing</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
