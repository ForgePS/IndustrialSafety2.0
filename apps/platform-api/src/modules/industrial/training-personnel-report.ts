import { absolutizePrintLogoUrl, sanitizeQuizDisplayText } from "./training-paper-quiz.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return date.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function resultClass(result: string): string {
  const normalized = result.toUpperCase();
  if (normalized === "PASSED") return "passed";
  if (normalized === "FAILED") return "failed";
  return "neutral";
}

export type TrainingPrintBranding = {
  companyName?: string | null;
  logoUrl?: string | null;
};

export type TrainingReportEmployee = {
  displayName: string;
  employeeNumber: string;
  jobTitle?: string | null;
  departmentName?: string | null;
  siteName?: string | null;
};

export type TrainingReportCompletionRow = {
  id: string;
  assignmentTitle: string;
  sourceTitle: string;
  versionLabel?: string | null;
  result: string;
  scorePercent: number;
  passingPercent: number;
  attemptNumber: number;
  completedAt: string;
};

export type TrainingReportOpenRow = {
  title: string;
  sourceTitle: string;
  status: string;
  dueAt?: string | null;
  bestPercent?: number | null;
};

export type TrainingReportLegacyRow = {
  title: string;
  courseName?: string | null;
  status?: string;
  result?: string | null;
  scorePercent?: number | null;
  attemptNumber?: number | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  printCompletionId?: string | null;
};

export type CompletionQuizItem = {
  stem: string;
  choices: string[];
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
};

export type CompletionPrintInput = {
  employee: TrainingReportEmployee;
  assignmentTitle: string;
  sourceTitle: string;
  versionLabel?: string | null;
  result: string;
  scorePercent: number;
  passingPercent: number;
  attemptNumber: number;
  completedAt: string;
  questions: CompletionQuizItem[];
  branding?: TrainingPrintBranding;
  generatedAt?: Date;
};

export type TrainingRecordPrintInput = {
  employee: TrainingReportEmployee;
  title: string;
  courseName?: string | null;
  result?: string | null;
  scorePercent?: number | null;
  instructorName?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  branding?: TrainingPrintBranding;
  generatedAt?: Date;
};

export type PersonnelReportInput = {
  employee: TrainingReportEmployee;
  openAssignments: TrainingReportOpenRow[];
  trainingRecords: TrainingReportLegacyRow[];
  branding?: TrainingPrintBranding;
  generatedAt?: Date;
};

function printStyles(): string {
  return `
    @page { margin: 0.45in 0.5in; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      color: #222;
      line-height: 1.25;
      font-size: 10.5pt;
      margin: 0;
    }
    .header { text-align: center; margin-bottom: 0.75rem; }
    .logo { display: block; max-height: 44px; max-width: 160px; object-fit: contain; margin: 0 auto 0.35rem; }
    h1 { font-size: 1.2rem; margin: 0 0 0.2rem; line-height: 1.2; }
    h2 { font-size: 1rem; margin: 1rem 0 0.35rem; line-height: 1.2; }
    .meta { color: #555; font-size: 0.78rem; margin: 0; }
    .employee {
      margin: 0.75rem 0 1rem;
      padding: 0.5rem 0.65rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .employee div { margin: 0.1rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin: 0.25rem 0 0.75rem; }
    th, td { border: 1px solid #ccc; padding: 0.3rem 0.4rem; text-align: left; vertical-align: top; }
    th { background: #f4f4f4; }
    .passed { color: #0a6b2d; font-weight: 700; }
    .failed { color: #a11; font-weight: 700; }
    .neutral { color: #444; }
    .question { margin: 0 0 0.75rem; break-inside: avoid-page; }
    .stem { margin: 0 0 0.2rem; }
    .choices { list-style: none; margin: 0; padding: 0; }
    .choices li { margin: 0.08rem 0; }
    .choices .letter { font-weight: 700; margin-right: 0.25rem; }
    .choices li.selected { font-weight: 700; }
    .choices li.correct { color: #0a6b2d; }
    .choices li.incorrect { color: #a11; }
    .summary { margin: 0.5rem 0 0.75rem; font-size: 0.95rem; }
    .footer { margin-top: 1rem; color: #666; font-size: 0.72rem; }
    .empty { color: #666; font-style: italic; margin: 0.25rem 0 0.75rem; }
    @media print {
      .no-print { display: none !important; }
      body { font-size: 10pt; }
      .question { break-inside: avoid-page; }
    }
  `;
}

function brandingHeader(title: string, subtitle: string, branding?: TrainingPrintBranding): string {
  const company = String(branding?.companyName ?? "").trim() || "Company";
  const logoUrl = absolutizePrintLogoUrl(branding?.logoUrl);
  const logoHtml = logoUrl
    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company)} logo" />`
    : "";
  return `<header class="header">
    ${logoHtml}
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(subtitle)}</div>
  </header>`;
}

function employeeBlock(employee: TrainingReportEmployee): string {
  const parts = [
    employee.displayName,
    employee.employeeNumber ? `#${employee.employeeNumber}` : "",
    employee.jobTitle ?? "",
    employee.departmentName ?? "",
    employee.siteName ?? "",
  ].filter(Boolean);
  return `<section class="employee">
    <div><strong>${escapeHtml(employee.displayName || "Employee")}</strong></div>
    <div>Employee #: ${escapeHtml(employee.employeeNumber || "—")}</div>
    ${employee.jobTitle ? `<div>Title: ${escapeHtml(employee.jobTitle)}</div>` : ""}
    ${employee.departmentName ? `<div>Department: ${escapeHtml(employee.departmentName)}</div>` : ""}
    ${employee.siteName ? `<div>Site: ${escapeHtml(employee.siteName)}</div>` : ""}
    ${parts.length ? "" : ""}
  </section>`;
}

function renderQuizItems(questions: CompletionQuizItem[]): string {
  if (!questions.length) {
    return `<p class="empty">Detailed question responses are not available for this completion.</p>`;
  }
  return questions
    .map((question, index) => {
      const stem = sanitizeQuizDisplayText(question.stem);
      const choices = Array.isArray(question.choices) ? question.choices : [];
      const choiceItems = choices
        .map((choice, choiceIndex) => {
          const letter = String.fromCharCode(65 + choiceIndex);
          const classes = [
            choiceIndex === question.selectedIndex ? "selected" : "",
            choiceIndex === question.correctIndex ? "correct" : "",
            choiceIndex === question.selectedIndex && !question.correct ? "incorrect" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const mark =
            choiceIndex === question.selectedIndex
              ? question.correct
                ? " ✓"
                : " ✗"
              : choiceIndex === question.correctIndex
                ? " ✓"
                : "";
          return `<li class="${classes}"><span class="letter">${letter}.</span> ${escapeHtml(sanitizeQuizDisplayText(String(choice)))}${mark}</li>`;
        })
        .join("");
      return `<section class="question">
  <h2>Question ${index + 1}</h2>
  <p class="stem">${escapeHtml(stem)}</p>
  <ul class="choices">${choiceItems || "<li><em>No choices listed</em></li>"}</ul>
</section>`;
    })
    .join("\n");
}

export function buildCompletionPrintableHtml(input: CompletionPrintInput): string {
  const when = (input.generatedAt ?? new Date()).toLocaleString();
  const edition = (input.versionLabel ?? "").trim();
  const heading = input.assignmentTitle.trim() || input.sourceTitle.trim() || "Training completion";
  const subtitle = [
    input.sourceTitle.trim(),
    edition ? `Edition: ${edition}` : "",
    `Generated ${when}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(heading)} - Completion</title>
  <style>${printStyles()}</style>
</head>
<body>
  <p class="no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
  ${brandingHeader(heading, subtitle, input.branding)}
  ${employeeBlock(input.employee)}
  <div class="summary">
    <div>Result: <span class="${resultClass(input.result)}">${escapeHtml(input.result)}</span></div>
    <div>Score: ${input.scorePercent}% (passing ${input.passingPercent}%)</div>
    <div>Attempt: #${input.attemptNumber}</div>
    <div>Completed: ${escapeHtml(formatDateTime(input.completedAt))}</div>
  </div>
  <h2>Quiz responses</h2>
  ${renderQuizItems(input.questions)}
  <p class="footer">Training completion record · ${escapeHtml(when)}</p>
</body>
</html>`;
}

export function buildTrainingRecordPrintableHtml(input: TrainingRecordPrintInput): string {
  const when = (input.generatedAt ?? new Date()).toLocaleString();
  const heading = input.title.trim() || input.courseName?.trim() || "Training record";
  const subtitle = [
    input.courseName && input.courseName.trim() !== heading ? input.courseName.trim() : "",
    `Generated ${when}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const result = String(input.result ?? "COMPLETED").trim() || "COMPLETED";
  const notes = String(input.notes ?? "").trim();
  const instructor = String(input.instructorName ?? "").trim();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(heading)} - Training record</title>
  <style>${printStyles()}</style>
</head>
<body>
  <p class="no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
  ${brandingHeader(heading, subtitle, input.branding)}
  ${employeeBlock(input.employee)}
  <div class="summary">
    <div>Result: <span class="${resultClass(result)}">${escapeHtml(result)}</span></div>
    <div>Completed: ${escapeHtml(formatDate(input.completedAt))}</div>
    <div>Expires: ${escapeHtml(formatDate(input.expiresAt))}</div>
    ${input.scorePercent != null ? `<div>Score: ${input.scorePercent}%</div>` : ""}
    ${instructor ? `<div>Instructor: ${escapeHtml(instructor)}</div>` : ""}
  </div>
  ${notes ? `<h2>Notes</h2><p>${escapeHtml(notes)}</p>` : ""}
  <p class="footer">Training record · ${escapeHtml(when)}</p>
</body>
</html>`;
}

export function buildPersonnelTrainingReportHtml(input: PersonnelReportInput): string {
  const when = (input.generatedAt ?? new Date()).toLocaleString();
  const subtitle = `Full training report · Generated ${when}`;

  const openRows = input.openAssignments
    .map(
      (row) => `<tr>
  <td>${escapeHtml(row.title)}<div class="meta">${escapeHtml(row.sourceTitle)}</div></td>
  <td>${escapeHtml(row.status.replace(/_/g, " "))}</td>
  <td>${row.bestPercent != null ? `${row.bestPercent}%` : "—"}</td>
  <td>${escapeHtml(formatDate(row.dueAt))}</td>
</tr>`,
    )
    .join("\n");

  const trainingRows = input.trainingRecords
    .map(
      (row) => `<tr>
  <td>${escapeHtml(row.title)}${row.courseName ? `<div class="meta">${escapeHtml(row.courseName)}</div>` : ""}</td>
  <td class="${resultClass(String(row.result ?? row.status ?? ""))}">${escapeHtml(String(row.result ?? row.status ?? "—"))}</td>
  <td>${row.scorePercent != null ? `${row.scorePercent}%` : "—"}</td>
  <td>${row.attemptNumber != null ? `#${row.attemptNumber}` : "—"}</td>
  <td>${escapeHtml(formatDate(row.completedAt))}</td>
</tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.employee.displayName || "Employee")} - Training report</title>
  <style>${printStyles()}</style>
</head>
<body>
  <p class="no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
  ${brandingHeader("Employee training report", subtitle, input.branding)}
  ${employeeBlock(input.employee)}

  <h2>Open assignments (${input.openAssignments.length})</h2>
  ${
    input.openAssignments.length
      ? `<table>
  <thead><tr><th>Assignment</th><th>Status</th><th>Best score</th><th>Due</th></tr></thead>
  <tbody>${openRows}</tbody>
</table>`
      : `<p class="empty">No open assignments.</p>`
  }

  <h2>Training records (${input.trainingRecords.length})</h2>
  ${
    input.trainingRecords.length
      ? `<table>
  <thead><tr><th>Course</th><th>Result</th><th>Score</th><th>Attempts</th><th>Completed</th></tr></thead>
  <tbody>${trainingRows}</tbody>
</table>`
      : `<p class="empty">No training records.</p>`
  }

  <p class="footer">Employee training report · ${escapeHtml(when)}</p>
</body>
</html>`;
}
