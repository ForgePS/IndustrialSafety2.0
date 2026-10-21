"use client";

import type { OshaForm300AMeta, OshaForm300ATotals } from "@/lib/osha-module";
import {
  DOL_HEADER,
  FORM_300A,
  OSHA_FORM_REVISION,
  OSHA_OMB,
} from "@/lib/osha-form-copy";

type Props = {
  totals: OshaForm300ATotals;
  meta: OshaForm300AMeta;
};

function LineValue({ value }: { value: string | number | null | undefined }) {
  const text = value == null || value === "" ? "0" : String(value);
  return <span className="osha-form-300a__value">{text}</span>;
}

export function Form300APrint({ totals, meta }: Props) {
  const yearShort = String(totals.year).slice(-2);

  return (
    <div className="osha-form-facsimile osha-form-300a" data-print-form="300A">
      <header className="osha-form-facsimile__header osha-form-300a__header">
        <div>
          <div className="osha-form-facsimile__form-id">
            {FORM_300A.title} ({OSHA_FORM_REVISION})
          </div>
          <h1 className="osha-form-facsimile__title">{FORM_300A.subtitle}</h1>
        </div>
        <div className="osha-form-facsimile__meta">
          <div>
            Year 20
            <span className="osha-form-facsimile__year-box">{yearShort}</span>
          </div>
          <div className="osha-form-facsimile__dol">
            <div>{DOL_HEADER.agency}</div>
            <div>{DOL_HEADER.osha}</div>
            <div className="small">{OSHA_OMB}</div>
          </div>
        </div>
      </header>

      <div className="osha-form-300a__instructions">
        {FORM_300A.instructions.map((p) => (
          <p key={p.slice(0, 40)}>{p}</p>
        ))}
      </div>

      <div className="osha-form-300a__grid">
        <div className="osha-form-300a__left">
          <section>
            <h2>{FORM_300A.numberOfCases}</h2>
            <div className="osha-form-300a__cases">
              <div>
                <LineValue value={totals.deaths} />
                <div>{FORM_300A.labels.G}</div>
              </div>
              <div>
                <LineValue value={totals.daysAwayCases} />
                <div>{FORM_300A.labels.H}</div>
              </div>
              <div>
                <LineValue value={totals.jobTransferCases} />
                <div>{FORM_300A.labels.I}</div>
              </div>
              <div>
                <LineValue value={totals.otherRecordableCases} />
                <div>{FORM_300A.labels.J}</div>
              </div>
            </div>
          </section>

          <section>
            <h2>{FORM_300A.numberOfDays}</h2>
            <div className="osha-form-300a__days">
              <div>
                <LineValue value={totals.daysAway} />
                <div>{FORM_300A.labels.K}</div>
              </div>
              <div>
                <LineValue value={totals.restrictedDays} />
                <div>{FORM_300A.labels.L}</div>
              </div>
            </div>
          </section>

          <section>
            <h2>
              {FORM_300A.injuryAndIllnessTypes} {FORM_300A.totalNumberOf}
            </h2>
            <div className="osha-form-300a__types">
              <div>
                <LineValue value={totals.injuries} /> {FORM_300A.labels.M1}
              </div>
              <div>
                <LineValue value={totals.poisonings} /> {FORM_300A.labels.M4}
              </div>
              <div>
                <LineValue value={totals.skinDisorders} /> {FORM_300A.labels.M2}
              </div>
              <div>
                <LineValue value={totals.hearingLoss} /> {FORM_300A.labels.M5}
              </div>
              <div>
                <LineValue value={totals.respiratoryConditions} /> {FORM_300A.labels.M3}
              </div>
              <div>
                <LineValue value={totals.allOtherIllnesses} /> {FORM_300A.labels.M6}
              </div>
            </div>
          </section>
        </div>

        <aside className="osha-form-300a__right">
          <section>
            <h2>{FORM_300A.establishmentInformation}</h2>
            <p>
              <strong>{FORM_300A.labels.establishmentName}</strong>
              <br />
              {meta.establishmentName || "—"}
            </p>
            <p>
              <strong>{FORM_300A.labels.street}</strong>
              <br />
              {meta.street || "—"}
            </p>
            <p>
              <strong>{FORM_300A.labels.city}</strong> {meta.city || "—"}{" "}
              <strong>{FORM_300A.labels.state}</strong> {meta.state || "—"}{" "}
              <strong>{FORM_300A.labels.zip}</strong> {meta.zip || "—"}
            </p>
            <p>
              <strong>{FORM_300A.labels.industryDescription}</strong>
              <br />
              {meta.industryDescription || "—"}
            </p>
            <p>
              <strong>{FORM_300A.labels.naics}</strong>
              <br />
              {meta.naics || "—"}
            </p>
          </section>

          <section>
            <h2>{FORM_300A.employmentInformation}</h2>
            <p className="small">{FORM_300A.employmentNote}</p>
            <p>
              <strong>{FORM_300A.labels.annualAverageEmployees}</strong>
              <br />
              {meta.annualAverageEmployees ?? "—"}
            </p>
            <p>
              <strong>{FORM_300A.labels.totalHoursWorked}</strong>
              <br />
              {meta.totalHoursWorked ?? "—"}
            </p>
          </section>

          <section>
            <h2>{FORM_300A.signHere}</h2>
            <p className="osha-form-300a__warn">{FORM_300A.falsifyWarning}</p>
            <p>{FORM_300A.certification}</p>
            <p>
              <strong>{FORM_300A.labels.companyExecutive}</strong>
              <br />
              {meta.companyExecutive || "—"}
            </p>
            <p>
              <strong>{FORM_300A.labels.title}</strong> {meta.executiveTitle || "—"}
            </p>
            <p>
              <strong>{FORM_300A.labels.phone}</strong> {meta.phone || "—"}
            </p>
            <p>
              <strong>{FORM_300A.labels.date}</strong> {meta.certificationDate || "—"}
            </p>
          </section>
        </aside>
      </div>

      <p className="osha-form-300a__post">
        <strong>{FORM_300A.postNotice}</strong>
      </p>
      <p className="osha-form-facsimile__burden">{FORM_300A.publicBurden}</p>
    </div>
  );
}
