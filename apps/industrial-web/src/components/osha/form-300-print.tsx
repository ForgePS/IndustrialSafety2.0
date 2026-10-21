"use client";

import {
  chunkForm300Pages,
  displayEmployeeName,
  formatOshaMonthDay,
  form300PageTotals,
  OSHA_FORM_300_ROWS_PER_PAGE,
  type OshaCase,
} from "@/lib/osha-module";
import {
  DOL_HEADER,
  FORM_300,
  OSHA_ATTENTION,
  OSHA_FORM_REVISION,
  OSHA_OMB,
} from "@/lib/osha-form-copy";

type Props = {
  year: number;
  establishment: string;
  city?: string;
  state?: string;
  cases: OshaCase[];
};

function Mark({ on }: { on: boolean }) {
  return <span className="osha-form-300__mark">{on ? "●" : ""}</span>;
}

function Form300Page({
  year,
  establishment,
  city = "",
  state = "",
  cases,
  pageIndex,
  pageCount,
}: Props & { pageIndex: number; pageCount: number }) {
  const totals = form300PageTotals(cases);
  const yearShort = String(year).slice(-2);
  const emptyRows = Math.max(0, OSHA_FORM_300_ROWS_PER_PAGE - cases.length);

  return (
    <div className="osha-form-facsimile osha-form-300" data-print-form="300">
      <header className="osha-form-facsimile__header">
        <div>
          <div className="osha-form-facsimile__form-id">
            {FORM_300.title} ({OSHA_FORM_REVISION})
          </div>
          <h1 className="osha-form-facsimile__title">{FORM_300.subtitle}</h1>
        </div>
        <div className="osha-form-facsimile__attention">
          <strong>Attention:</strong> {OSHA_ATTENTION}
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
          <div className="osha-form-300__estab">
            <div>
              <strong>Establishment name</strong> {establishment || "—"}
            </div>
            <div>
              <strong>City</strong> {city || "—"}{" "}
              <strong>State</strong> {state || "—"}
            </div>
            {pageCount > 1 ? (
              <div className="small text-muted">
                Page {pageIndex + 1} of {pageCount}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="osha-form-300__instructions">
        <div>
          <strong>{FORM_300.pleaseRecordHeading}</strong>
          <ul>
            {FORM_300.pleaseRecord.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <strong>{FORM_300.remindersHeading}</strong>
          <ul>
            {FORM_300.reminders.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      <table className="osha-form-300__table">
        <thead>
          <tr>
            <th colSpan={3}>{FORM_300.steps[1]}</th>
            <th colSpan={3}>{FORM_300.steps[2]}</th>
            <th colSpan={4}>{FORM_300.steps[3]}</th>
            <th colSpan={2}>{FORM_300.steps[4]}</th>
            <th colSpan={6}>{FORM_300.steps[5]}</th>
          </tr>
          <tr>
            <th>{FORM_300.columns.A}</th>
            <th>{FORM_300.columns.B}</th>
            <th>{FORM_300.columns.C}</th>
            <th>{FORM_300.columns.D}</th>
            <th>{FORM_300.columns.E}</th>
            <th>{FORM_300.columns.F}</th>
            <th>{FORM_300.columns.G}</th>
            <th>{FORM_300.columns.H}</th>
            <th>{FORM_300.columns.I}</th>
            <th>{FORM_300.columns.J}</th>
            <th>{FORM_300.columns.K}</th>
            <th>{FORM_300.columns.L}</th>
            <th>(1)</th>
            <th>(2)</th>
            <th>(3)</th>
            <th>(4)</th>
            <th>(5)</th>
            <th>(6)</th>
          </tr>
        </thead>
        <tbody>
          {cases.length === 0 && pageIndex === 0 ? (
            <tr>
              <td colSpan={18} className="text-muted">
                No recordable cases for this year and establishment.
              </td>
            </tr>
          ) : (
            <>
              {cases.map((row) => (
                <tr key={row.id}>
                  <td>{row.caseNumber}</td>
                  <td>{displayEmployeeName(row)}</td>
                  <td>{row.jobTitle}</td>
                  <td>{formatOshaMonthDay(row.injuryDate)}</td>
                  <td>{row.eventLocation}</td>
                  <td>{row.description}</td>
                  <td>
                    <Mark on={row.caseOutcome === "DEATH"} />
                  </td>
                  <td>
                    <Mark on={row.caseOutcome === "DAYS_AWAY"} />
                  </td>
                  <td>
                    <Mark on={row.caseOutcome === "JOB_TRANSFER_RESTRICTION"} />
                  </td>
                  <td>
                    <Mark on={row.caseOutcome === "OTHER_RECORDABLE"} />
                  </td>
                  <td>{row.daysAway ?? ""}</td>
                  <td>{row.restrictedDays ?? ""}</td>
                  <td>
                    <Mark on={row.illnessCategory === "1"} />
                  </td>
                  <td>
                    <Mark on={row.illnessCategory === "2"} />
                  </td>
                  <td>
                    <Mark on={row.illnessCategory === "3"} />
                  </td>
                  <td>
                    <Mark on={row.illnessCategory === "4"} />
                  </td>
                  <td>
                    <Mark on={row.illnessCategory === "5"} />
                  </td>
                  <td>
                    <Mark on={row.illnessCategory === "6"} />
                  </td>
                </tr>
              ))}
              {Array.from({ length: emptyRows }).map((_, idx) => (
                <tr key={`empty-${pageIndex}-${idx}`}>
                  {Array.from({ length: 18 }).map((__, cell) => (
                    <td key={cell}>&nbsp;</td>
                  ))}
                </tr>
              ))}
            </>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6}>
              <strong>Page totals</strong> — {FORM_300.pageTotalsNote}
            </td>
            <td>{totals.deaths}</td>
            <td>{totals.daysAwayCases}</td>
            <td>{totals.jobTransferCases}</td>
            <td>{totals.otherRecordableCases}</td>
            <td>{totals.daysAway}</td>
            <td>{totals.restrictedDays}</td>
            <td>{totals.m1}</td>
            <td>{totals.m2}</td>
            <td>{totals.m3}</td>
            <td>{totals.m4}</td>
            <td>{totals.m5}</td>
            <td>{totals.m6}</td>
          </tr>
        </tfoot>
      </table>

      <p className="osha-form-facsimile__burden">{FORM_300.publicBurden}</p>
    </div>
  );
}

export function Form300Print({ year, establishment, city = "", state = "", cases }: Props) {
  const pages = chunkForm300Pages(cases);
  return (
    <>
      {pages.map((pageCases, pageIndex) => (
        <Form300Page
          key={`form-300-page-${pageIndex}`}
          year={year}
          establishment={establishment}
          city={city}
          state={state}
          cases={pageCases}
          pageIndex={pageIndex}
          pageCount={pages.length}
        />
      ))}
    </>
  );
}
