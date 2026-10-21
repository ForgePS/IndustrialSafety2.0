"use client";

import {
  isDisplayableLotoImageUrl,
  type FieldLotoProcedureDisplay,
} from "@/lib/loto";

export function LotoProcedureView({ display }: { display: FieldLotoProcedureDisplay }) {
  const meta = [
    display.procedureNumber,
    display.revision ? `Rev ${display.revision}` : "",
    display.siteName !== "—" ? display.siteName : "",
    display.divisionName !== "—" ? display.divisionName : "",
    display.departmentName !== "—" ? display.departmentName : "",
    display.areaName !== "—" ? display.areaName : "",
  ].filter(Boolean);

  return (
    <>
      {meta.length > 0 ? <p className="ff-meta">{meta.join(" · ")}</p> : null}
      {display.equipmentTypeName || display.equipmentExternalId ? (
        <p className="ff-meta">
          {[display.equipmentTypeName, display.equipmentExternalId].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {display.scope ? <p className="ff-page-body">{display.scope}</p> : null}

      {display.reviewReturnNotes ? (
        <section className="ff-section" aria-label="Correction notes">
          <h2 className="ff-section-title">Correction notes</h2>
          <p className="ff-page-body">{display.reviewReturnNotes}</p>
        </section>
      ) : null}

      {isDisplayableLotoImageUrl(display.equipmentImageUrl) ? (
        <section className="ff-section" aria-label="Equipment photo">
          <h2 className="ff-section-title">Equipment photo</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={display.equipmentImageUrl}
            alt={display.equipmentImageCaption || display.equipmentName || "Equipment"}
            style={{ maxWidth: "100%", height: "auto", borderRadius: "0.5rem" }}
          />
          {display.equipmentImageCaption ? (
            <p className="ff-meta">{display.equipmentImageCaption}</p>
          ) : null}
        </section>
      ) : null}

      {display.tags.length > 0 ? (
        <p className="ff-meta">{display.tags.join(" · ")}</p>
      ) : null}

      <section className="ff-section">
        <h2 className="ff-section-title">Energy sources</h2>
        {display.energySources.length === 0 ? (
          <p className="ff-page-body">None stored on this procedure yet.</p>
        ) : (
          <ul className="ff-plain-list">
            {display.energySources.map((row) => (
              <li key={row.id}>
                <strong>{row.energyType}</strong>
                {row.magnitude ? ` · ${row.magnitude}` : ""}
                {row.description ? <span className="ff-meta"> — {row.description}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ff-section">
        <h2 className="ff-section-title">Isolation points</h2>
        {display.isolationPoints.length === 0 ? (
          <p className="ff-page-body">None stored on this procedure yet.</p>
        ) : (
          <ul className="ff-plain-list">
            {display.isolationPoints.map((row) => (
              <li key={row.id}>
                <strong>{row.label}</strong>
                {row.locationDescription ? ` · ${row.locationDescription}` : ""}
                {row.isolationMethod ? (
                  <span className="ff-meta"> — Method: {row.isolationMethod}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {display.notes.length > 0 ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Precautions</h2>
          <ul className="ff-plain-list">
            {display.notes.map((note) => (
              <li key={note.id}>
                <strong>{note.label}</strong>
                <span className="ff-meta"> — {note.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {display.attachments.length > 0 ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Attachments</h2>
          <ul className="ff-plain-list">
            {display.attachments.map((file) => (
              <li key={file.id}>
                {file.url ? (
                  <a className="ff-link" href={file.url} target="_blank" rel="noreferrer">
                    {file.filename}
                  </a>
                ) : (
                  file.filename
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
