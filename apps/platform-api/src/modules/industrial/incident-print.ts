/**
 * Printable HTML for industrial incident reports.
 */

export function escapeIncidentHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstText(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function bodyLocationsLabel(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .join(", ");
  }
  if (typeof raw === "string") return raw.trim();
  return "";
}

/** Labeled detail rows for the printable incident report. */
export function incidentPrintDetailRows(
  record: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Status", value: firstText(record, ["status"]) },
    {
      label: "Type",
      value: firstText(record, [
        "incidentTypeName",
        "IncidentTypeName",
        "category",
        "incidentCategory",
      ]),
    },
    { label: "Severity", value: firstText(record, ["severity"]) },
    {
      label: "Person affected",
      value: firstText(record, ["personAffected", "PersonAffected", "Person"]),
    },
    {
      label: "Reported by",
      value: firstText(record, ["reportedBy", "SubmittedBy", "Person"]),
    },
    {
      label: "Witnesses",
      value: firstText(record, ["witnessNames", "WitnessNames", "witnessName"]),
    },
    {
      label: "Occurred",
      value: firstText(record, ["dateOccurred", "IncidentDateTime", "DTStamp", "reportDateTime"]),
    },
    {
      label: "Submitted",
      value: firstText(record, ["submittedAt", "IncidentSubmitted", "reportDateTime", "DTStamp"]),
    },
    {
      label: "Location",
      value: firstText(record, ["location", "IncidentLocationName", "LocationDetail", "site"]),
    },
    {
      label: "Body part",
      value:
        bodyLocationsLabel(record.bodyLocations) ||
        firstText(record, ["injuriesFront", "InjuriesFront", "injuriesBack", "InjuriesBack"]),
    },
    {
      label: "Department",
      value: firstText(record, ["departmentName", "DepartmentName", "department"]),
    },
    { label: "Division", value: firstText(record, ["division", "Division"]) },
    {
      label: "Area / community",
      value: firstText(record, ["community", "Community"]),
    },
    {
      label: "Injuries (front)",
      value: firstText(record, ["injuriesFront", "InjuriesFront"]),
    },
    {
      label: "Injuries (back)",
      value: firstText(record, ["injuriesBack", "InjuriesBack"]),
    },
  ];
  return rows.filter((row) => row.value.trim() !== "");
}

const SUSPICION_INDICATOR_LABELS: Record<string, string> = {
  "bloodshot-eyes": "Bloodshot, watery, or glassy eyes",
  pupils: "Dilated or constricted pupils",
  "flushed-pale": "Flushed or unusually pale face",
  disheveled: "Disheveled or unkempt appearance",
  sweating: "Excessive sweating",
  drowsy: "Drowsy, sleeping, or difficult to wake",
  confused: "Confused or disoriented",
  aggressive: "Aggressive, combative, or argumentative",
  "mood-swings": "Unusual mood swings or agitation",
  paranoid: "Paranoid, anxious, or hyperactive",
  "slurred-speech": "Slurred or incoherent speech",
  "rapid-speech": "Unusually rapid or slow speech",
  "unsteady-gait": "Unsteady gait, stumbling, or swaying",
  "poor-coordination": "Poor coordination or fumbling",
  tremors: "Hand tremors",
  "odor-alcohol": "Odor of alcohol",
  "odor-marijuana": "Odor of marijuana",
  "observed-use": "Observed using drugs or alcohol",
  possession: "Possession of drugs, alcohol, or paraphernalia",
  "unsafe-work": "Unsafe work practices or near miss",
  performance: "Sudden decline in work performance",
};

const SUSPICION_TRANSPORT_LABELS: Record<string, string> = {
  "company-escort": "Company representative escorted employee",
  rideshare: "Taxi / rideshare arranged by company",
  family: "Family member or friend picked up employee",
  ems: "Emergency medical services",
  refused: "Employee refused transportation",
};

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

function metaGridHtml(rows: Array<{ label: string; value: string }>): string {
  return `<div class="incident-print__meta">${rows
    .map(
      (item) =>
        `<div><strong>${escapeIncidentHtml(item.label)}</strong><br/>${escapeIncidentHtml(item.value)}</div>`,
    )
    .join("")}</div>`;
}

function signatureHtml(label: string, dataUrl: string): string {
  if (!/^data:image\/(png|jpeg|svg\+xml);base64,/i.test(dataUrl)) return "";
  return `<div><strong>${escapeIncidentHtml(label)}</strong><br/><img class="incident-print__signature" src="${escapeIncidentHtml(dataUrl)}" alt="" /></div>`;
}

/** Reasonable-suspicion observation rows (Incidents → Drug/Alcohol). */
export function reasonableSuspicionPrintRows(
  raw: unknown,
): Array<{ label: string; value: string }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const row = raw as Record<string, unknown>;
  const rows: Array<{ label: string; value: string }> = [];
  const observedAt = text(row, "observedAt");
  if (observedAt) rows.push({ label: "Observed", value: observedAt });
  const indicators = (Array.isArray(row.indicators) ? row.indicators : [])
    .filter((item): item is string => typeof item === "string")
    .map((id) => SUSPICION_INDICATOR_LABELS[id] ?? id);
  const indicatorsOther = text(row, "indicatorsOther");
  if (indicatorsOther) indicators.push(`Other: ${indicatorsOther}`);
  if (indicators.length) rows.push({ label: "Observed signs", value: indicators.join("; ") });
  const narrative = text(row, "observationNarrative");
  if (narrative) rows.push({ label: "Observations", value: narrative });
  if (typeof row.dotCovered === "boolean") {
    rows.push({ label: "DOT-covered driver", value: row.dotCovered ? "Yes" : "No" });
  }
  const observer = text(row, "observerName");
  if (observer) {
    const title = text(row, "observerTitle");
    rows.push({
      label: "Observing supervisor",
      value: `${title ? `${observer} (${title})` : observer}${
        row.observerTrained === true ? " - reasonable-suspicion trained" : ""
      }`,
    });
  }
  const signedAt = text(row, "observerSignedAt");
  if (signedAt) rows.push({ label: "Supervisor signed", value: signedAt });
  const second = text(row, "secondObserverName");
  if (second) {
    const title = text(row, "secondObserverTitle");
    rows.push({ label: "Second observer", value: title ? `${second} (${title})` : second });
  }
  if (row.removedFromDuty === true) {
    const at = text(row, "removedFromDutyAt");
    rows.push({ label: "Removed from duty", value: at ? `Yes - ${at}` : "Yes" });
  }
  const transport = text(row, "transportation");
  if (transport) {
    rows.push({
      label: "Transportation",
      value:
        transport === "other"
          ? text(row, "transportationOther") || "Other"
          : (SUSPICION_TRANSPORT_LABELS[transport] ?? transport),
    });
  }
  const statement = text(row, "employeeStatement");
  if (statement) rows.push({ label: "Employee statement", value: statement });
  const followUp = text(row, "followUpNotes");
  if (followUp) rows.push({ label: "Follow-up", value: followUp });
  return rows;
}

/** One block per drug & alcohol consent form on the incident. */
export function drugAlcoholConsentPrintBlocks(
  raw: unknown,
): Array<{ employee: string; rows: Array<{ label: string; value: string }> }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .filter((item) => item.testingRequired === true)
    .map((item, index) => {
      const reason = text(item, "reason");
      const substances = (Array.isArray(item.substances) ? item.substances : [])
        .filter((s): s is string => typeof s === "string")
        .join(", ");
      const rows = [
        {
          label: "Reason",
          value:
            reason === "other" ? text(item, "reasonOther") || "Other" : reason.replace(/-/g, " "),
        },
        { label: "Tests", value: substances },
        { label: "Test status", value: text(item, "testStatus").replace(/-/g, " ") },
        { label: "Consent signed", value: text(item, "employeeSignature") ? "Yes" : "No" },
        { label: "Witness", value: text(item, "witnessName") },
        { label: "Collection site", value: text(item, "collectionSite") },
        { label: "Ordered / scheduled", value: text(item, "orderedAt") },
        { label: "Collection completed", value: text(item, "completedAt") },
        { label: "Result / MRO notes", value: text(item, "resultNotes") },
        { label: "Comments", value: text(item, "additionalComments") },
      ].filter((r) => r.value !== "");
      return { employee: text(item, "employeeName") || `Employee ${index + 1}`, rows };
    });
}

export function buildIncidentPrintableHtml(
  record: Record<string, unknown>,
  branding: { companyName?: string | null; logoUrl?: string | null } = {},
): string {
  const title = firstText(record, ["title", "displayName", "IncidentName"]) || "Incident report";
  const description = firstText(record, [
    "description",
    "IncidentDescription",
    "WorkDayDetails",
    "InjuryTypeDesc",
  ]);
  const corrective = firstText(record, ["workDayDetails", "WorkDayDetails"]);
  const showCorrective = Boolean(corrective) && corrective !== description;
  const details = incidentPrintDetailRows(record);
  const company = String(branding.companyName ?? "").trim();
  const logo = String(branding.logoUrl ?? "").trim();
  const logoHtml = logo
    ? `<img class="incident-print__logo" src="${escapeIncidentHtml(logo)}" alt="" />`
    : "";
  const detailHtml =
    details.length === 0
      ? '<p class="muted">No detail fields recorded.</p>'
      : `<div class="incident-print__meta">${details
          .map(
            (row) =>
              `<div><strong>${escapeIncidentHtml(row.label)}</strong><br/>${escapeIncidentHtml(row.value)}</div>`,
          )
          .join("")}</div>`;

  const refusal = record.medicalRefusalAcknowledgment;
  let refusalHtml = "";
  if (refusal && typeof refusal === "object" && !Array.isArray(refusal)) {
    const row = refusal as Record<string, unknown>;
    const refusalRows: Array<{ label: string; value: string }> = [];
    const decision = String(row.employeeDecision ?? "").trim();
    if (decision) {
      refusalRows.push({
        label: "Employee decision",
        value:
          decision === "other"
            ? String(row.employeeDecisionOther ?? "").trim() || "Other"
            : decision,
      });
    }
    const services = Array.isArray(row.servicesOffered)
      ? row.servicesOffered.filter((item): item is string => typeof item === "string")
      : [];
    if (services.length || String(row.servicesOther ?? "").trim()) {
      const labels = [
        ...services,
        ...(String(row.servicesOther ?? "").trim()
          ? [`Other: ${String(row.servicesOther).trim()}`]
          : []),
      ];
      refusalRows.push({ label: "Medical services offered", value: labels.join(", ") });
    }
    if (String(row.witnessName ?? "").trim()) {
      refusalRows.push({
        label: "Witness",
        value: [
          String(row.witnessName).trim(),
          String(row.witnessTitle ?? "").trim() ? `(${String(row.witnessTitle).trim()})` : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
    if (String(row.additionalComments ?? "").trim()) {
      refusalRows.push({
        label: "Additional comments",
        value: String(row.additionalComments).trim(),
      });
    }
    if (refusalRows.length) {
      refusalHtml = `<h2>Medical Evaluation / Treatment Refusal Acknowledgment</h2>
<div class="incident-print__meta">${refusalRows
        .map(
          (item) =>
            `<div><strong>${escapeIncidentHtml(item.label)}</strong><br/>${escapeIncidentHtml(item.value)}</div>`,
        )
        .join("")}</div>`;
    }
  }

  let suspicionHtml = "";
  const suspicionRows = reasonableSuspicionPrintRows(record.reasonableSuspicion);
  if (suspicionRows.length) {
    const suspicion = record.reasonableSuspicion as Record<string, unknown>;
    const signatures = [
      signatureHtml("Supervisor signature", text(suspicion, "observerSignature")),
      signatureHtml("Second observer signature", text(suspicion, "secondObserverSignature")),
    ].join("");
    suspicionHtml = `<h2>Reasonable Suspicion Observation</h2>
${metaGridHtml(suspicionRows)}${signatures ? `<div class="incident-print__meta">${signatures}</div>` : ""}`;
  }

  const consentHtml = drugAlcoholConsentPrintBlocks(record.drugAlcoholConsents)
    .map(
      (block) =>
        `<h2>Drug &amp; Alcohol Consent and Test - ${escapeIncidentHtml(block.employee)}</h2>
${metaGridHtml(block.rows)}`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>${escapeIncidentHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  h2 { font-size: 1rem; margin: 20px 0 8px; }
  .muted { color: #566a7f; font-size: 0.875rem; }
  .incident-print__toolbar { margin-bottom: 16px; }
  .incident-print__toolbar button {
    font: inherit; padding: 8px 14px; cursor: pointer;
    border: 1px solid #8592a3; border-radius: 6px; background: #fff;
  }
  .incident-print__head { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
  .incident-print__logo { max-height: 48px; max-width: 160px; }
  .incident-print__meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 16px; }
  .incident-print__narrative { white-space: pre-wrap; margin: 0; }
  .incident-print__signature { max-height: 80px; max-width: 100%; border: 1px solid #d9dee3; background: #fff; }
  @media print {
    body { margin: 12px; }
    .no-print { display: none !important; }
  }
</style></head><body>
<p class="incident-print__toolbar no-print">
  <button type="button" onclick="window.print()">Print / Save as PDF</button>
</p>
<div class="incident-print__head">${logoHtml}<div>
  <h1>${escapeIncidentHtml(title)}</h1>
  <p class="muted">${escapeIncidentHtml(company || "Incident report")}</p>
</div></div>
${detailHtml}
${
  description
    ? `<h2>Description</h2><p class="incident-print__narrative">${escapeIncidentHtml(description)}</p>`
    : ""
}
${
  showCorrective
    ? `<h2>Immediate corrective action(s)</h2><p class="incident-print__narrative">${escapeIncidentHtml(corrective)}</p>`
    : ""
}
${!description && !showCorrective ? `<p class="muted">No description was recorded on this report.</p>` : ""}
${suspicionHtml}
${consentHtml}
${refusalHtml}
</body></html>`;
}
