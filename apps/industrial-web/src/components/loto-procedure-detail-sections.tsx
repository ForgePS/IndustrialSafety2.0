"use client";

import { LotoAnnotatedImage } from "@/components/loto-annotated-image";
import { isDisplayableLotoImageUrl } from "@/lib/loto-clipboard-images";
import { lotoEnergyLetterStyle, lotoPhaseBadgeClass, type LotoProcedureDisplay } from "@/lib/loto";

type LotoProcedureDetailSectionsProps = {
  display: LotoProcedureDisplay;
};

export function LotoProcedureDetailSections({ display }: LotoProcedureDetailSectionsProps) {
  return (
    <>
      <dl className="row mb-3 small">
        <dt className="col-sm-3 text-muted">Equipment</dt>
        <dd className="col-sm-9 mb-2">
          {display.equipmentName !== "—" ? display.equipmentName : "—"}
          {display.equipmentTypeName ? (
            <span className="text-muted"> · {display.equipmentTypeName}</span>
          ) : null}
          {display.equipmentExternalId ? (
            <span className="text-muted"> · {display.equipmentExternalId}</span>
          ) : null}
        </dd>
        <dt className="col-sm-3 text-muted">Site</dt>
        <dd className="col-sm-9 mb-2">{display.siteName !== "—" ? display.siteName : "—"}</dd>
        <dt className="col-sm-3 text-muted">Division</dt>
        <dd className="col-sm-9 mb-2">
          {display.divisionName !== "—" ? display.divisionName : "—"}
        </dd>
        <dt className="col-sm-3 text-muted">Department</dt>
        <dd className="col-sm-9 mb-2">
          {display.departmentName !== "—" ? display.departmentName : "—"}
        </dd>
        <dt className="col-sm-3 text-muted">Area</dt>
        <dd className="col-sm-9 mb-2">{display.areaName !== "—" ? display.areaName : "—"}</dd>
        <dt className="col-sm-3 text-muted">Revision</dt>
        <dd className="col-sm-9 mb-2">{display.revision || "1"}</dd>
      </dl>

      {display.scope ? <p className="mb-3">{display.scope}</p> : null}

      {display.reviewReturnNotes ? (
        <div className="alert alert-warning mb-4" role="status">
          <div className="fw-semibold mb-1">EHS Director — corrections requested</div>
          <p className="mb-1">{display.reviewReturnNotes}</p>
          {display.reviewReturnedByName || display.reviewReturnedAt ? (
            <p className="small text-muted mb-0">
              {[display.reviewReturnedByName, display.reviewReturnedAt].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {display.equipmentImages.length > 0 ? (
        <div className="d-flex flex-wrap gap-3 mb-4">
          {display.equipmentImages.map((photo, index) =>
            isDisplayableLotoImageUrl(photo.imageUrl) ? (
              <figure key={`equip-${index}`} className="mb-0">
                <LotoAnnotatedImage
                  src={photo.imageUrl}
                  alt={
                    photo.caption || display.equipmentImageCaption || `Equipment photo ${index + 1}`
                  }
                  arrows={photo.annotations}
                  imgStyle={{ maxHeight: 280 }}
                />
              </figure>
            ) : null,
          )}
        </div>
      ) : isDisplayableLotoImageUrl(display.equipmentImageUrl) ? (
        <figure className="mb-4">
          <LotoAnnotatedImage
            src={display.equipmentImageUrl}
            alt={display.equipmentImageCaption || "Equipment photo"}
            arrows={display.equipmentImageAnnotations}
            imgStyle={{ maxHeight: 280 }}
          />
        </figure>
      ) : null}

      {display.tags.length > 0 ? (
        <div className="mb-3 d-flex flex-wrap gap-1">
          {display.tags.map((tag) => (
            <span key={tag} className="badge bg-label-secondary">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <h6>Energy sources</h6>
          {display.energySources.length === 0 ? (
            <p className="text-muted small mb-0">None stored on this procedure yet.</p>
          ) : (
            <ul className="list-unstyled mb-0">
              {display.energySources.map((row) => {
                const energy = lotoEnergyLetterStyle(
                  row.magnitude || row.description,
                  row.energyType,
                );
                return (
                  <li key={row.id} className="mb-2">
                    <span
                      className={`badge me-2 ${energy ? "" : "bg-label-danger"}`.trim()}
                      style={energy ? { backgroundColor: energy.bg, color: energy.fg } : undefined}
                    >
                      {energy ? `🔒${energy.letter}` : null}
                      {energy ? " " : null}
                      {row.energyType}
                    </span>
                    {row.magnitude}
                    {row.description ? (
                      <div className="small text-muted mt-1">{row.description}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="col-md-6">
          <h6>Isolation points</h6>
          {display.isolationPoints.length === 0 ? (
            <p className="text-muted small mb-0">None stored on this procedure yet.</p>
          ) : (
            <ul className="list-unstyled mb-0">
              {display.isolationPoints.map((row) => (
                <li key={row.id} className="mb-2">
                  <strong>{row.label}</strong>
                  {row.locationDescription ? ` · ${row.locationDescription}` : ""}
                  {row.isolationMethod ? (
                    <div className="small text-muted">Method: {row.isolationMethod}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h6>Control steps</h6>
      <div className="timeline mb-4">
        {display.steps.length === 0 ? (
          <p className="text-muted small">No isolation or verification steps saved.</p>
        ) : (
          display.steps.map((step) => {
            const energy = lotoEnergyLetterStyle(step.descriptionCode, step.energySourceName);
            return (
              <div className="d-flex gap-3 mb-3" key={step.id}>
                <span
                  className={`badge align-self-start rounded-1 px-2 py-2 text-start ${energy ? "" : lotoPhaseBadgeClass(step.stepPhase)}`.trim()}
                  style={
                    energy
                      ? { backgroundColor: energy.bg, color: energy.fg, minWidth: "3.25rem" }
                      : { minWidth: "3.25rem" }
                  }
                  title={energy ? `🔒${energy.letter} — ${energy.label}` : undefined}
                >
                  {energy ? (
                    <>
                      <span className="d-block fw-bold">#{step.stepNumber}</span>
                      <span className="d-block small">🔒{energy.letter}</span>
                    </>
                  ) : (
                    step.stepPhase || "STEP"
                  )}
                </span>
                <div>
                  <div className="fw-medium">
                    {step.stepNumber}. {step.instruction}
                  </div>
                  {step.descriptionCode ? (
                    <div className="small text-muted mt-1">{step.descriptionCode}</div>
                  ) : null}
                  {step.customDescription ? (
                    <div className="small text-muted mt-1">
                      Enter your own description: {step.customDescription}
                    </div>
                  ) : null}
                  {step.isVerification ? (
                    <small className="text-warning">Zero-energy verification required</small>
                  ) : null}
                  {(step.stepImages?.length
                    ? step.stepImages
                    : step.stepImageUrl
                      ? [
                          {
                            imageUrl: step.stepImageUrl,
                            annotations: step.stepImageAnnotations,
                            caption: "",
                          },
                        ]
                      : []
                  ).map((photo, photoIndex) =>
                    isDisplayableLotoImageUrl(photo.imageUrl) ? (
                      <div className="mt-2" key={`${step.id}-photo-${photoIndex}`}>
                        <LotoAnnotatedImage
                          src={photo.imageUrl}
                          alt={`Step ${step.stepNumber} photo ${photoIndex + 1}`}
                          arrows={photo.annotations}
                          imgStyle={{ maxHeight: 180 }}
                        />
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {display.restorationChecks.length > 0 ? (
        <div className="mb-4">
          <h6>Restoration checks</h6>
          <ul className="mb-0">
            {display.restorationChecks.map((check) => (
              <li key={check.id}>
                {check.label}
                {check.completed ? <span className="badge bg-label-success ms-2">Done</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {display.notes.length > 0 ? (
        <div className="mb-4">
          <h6>Notes</h6>
          <ul className="list-unstyled mb-0">
            {display.notes.map((note) => (
              <li key={note.id} className="mb-2">
                <strong>{note.label}</strong>
                <div className="text-muted small">{note.text}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {display.attachments.length > 0 ? (
        <div className="mb-2">
          <h6>Attachments</h6>
          <ul className="mb-0">
            {display.attachments.map((file) => (
              <li key={file.id}>
                {file.url ? (
                  <a href={file.url} target="_blank" rel="noreferrer">
                    {file.filename}
                  </a>
                ) : (
                  file.filename
                )}
                {file.contentType ? (
                  <span className="text-muted small"> · {file.contentType}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
