/**
 * Missed trainings report: every person with NOT STARTED training past its due date.
 * Days late counts calendar days, so the day after the due date is 1 day late.
 */

export type MissedReportRosterRow = {
  assignmentId: string;
  assignmentTitle: string;
  sourceTitle?: string | null;
  personnelId?: string | null;
  employeeNumber?: string | null;
  userLabel: string;
  siteName?: string | null;
  status: string;
  dueAt?: string | null;
  assignedAt?: string | null;
};

export type MissedTraining = {
  assignmentId: string;
  title: string;
  /** YYYY-MM-DD, or null when unknown. */
  assignedOn: string | null;
  /** YYYY-MM-DD */
  dueOn: string;
  daysLate: number;
};

export type MissedTrainingPerson = {
  key: string;
  name: string;
  employeeNumber: string | null;
  siteName: string | null;
  trainings: MissedTraining[];
};

const DAY_MS = 86_400_000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date of a timestamp as YYYY-MM-DD. */
export function localDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Due dates are picked as a date and saved as midnight UTC, so the UTC date is the day the
 * person picked. Reading it in local time would show the day before in US time zones.
 */
export function dueDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / DAY_MS;
}

/** Whole days from the due date to today. 0 on the due date, 1 the day after. */
export function daysLate(dueOn: string, today: string): number {
  return dayNumber(today) - dayNumber(dueOn);
}

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function buildMissedTrainingReport(
  roster: readonly MissedReportRosterRow[],
  now: Date = new Date(),
): MissedTrainingPerson[] {
  const today = localDay(now)!;
  const people = new Map<string, MissedTrainingPerson>();
  for (const row of roster) {
    if (String(row.status ?? "").toUpperCase() !== "NOT_STARTED") continue;
    const dueOn = dueDay(row.dueAt);
    if (!dueOn) continue;
    const late = daysLate(dueOn, today);
    if (late < 1) continue;

    const employeeNumber = row.employeeNumber?.trim() || null;
    const key = row.personnelId || employeeNumber || row.userLabel;
    let person = people.get(key);
    if (!person) {
      person = {
        key,
        name: row.userLabel,
        employeeNumber,
        siteName: row.siteName ?? null,
        trainings: [],
      };
      people.set(key, person);
    }
    person.trainings.push({
      assignmentId: row.assignmentId,
      title: row.assignmentTitle || row.sourceTitle || "Training",
      assignedOn: localDay(row.assignedAt),
      dueOn,
      daysLate: late,
    });
  }
  const result = [...people.values()];
  for (const person of result) {
    // Most overdue first.
    person.trainings.sort(
      (a, b) => b.daysLate - a.daysLate || nameCollator.compare(a.title, b.title),
    );
  }
  return result.sort((a, b) => nameCollator.compare(a.name, b.name));
}

/** "Nov 9, 2026" for a YYYY-MM-DD day. */
export function formatReportDay(day: string | null): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysLateLabel(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"} late`;
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildMissedTrainingCsv(people: readonly MissedTrainingPerson[]): string {
  const lines = [
    ["Name", "Employee #", "Location", "Training", "Assigned", "Due by", "Days late"].join(","),
  ];
  for (const person of people) {
    for (const t of person.trainings) {
      lines.push(
        [
          person.name,
          person.employeeNumber ?? "",
          person.siteName ?? "",
          t.title,
          t.assignedOn ?? "",
          t.dueOn,
          String(t.daysLate),
        ]
          .map(escapeCsv)
          .join(","),
      );
    }
  }
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildMissedTrainingPrintHtml(
  people: readonly MissedTrainingPerson[],
  now: Date = new Date(),
): string {
  const total = people.reduce((sum, p) => sum + p.trainings.length, 0);
  const generated = now.toLocaleString();
  const sections = people
    .map((person) => {
      const meta = [person.employeeNumber ? `#${person.employeeNumber}` : "", person.siteName ?? ""]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" · ");
      const rows = person.trainings
        .map(
          (t) =>
            `<tr><td>${escapeHtml(t.title)}</td><td>${formatReportDay(t.assignedOn)}</td><td>${formatReportDay(t.dueOn)}</td><td class="late">${daysLateLabel(t.daysLate)}</td></tr>`,
        )
        .join("");
      return `<section><h2>${escapeHtml(person.name)}${meta ? ` <span>${meta}</span>` : ""}</h2>
<table><thead><tr><th>Training</th><th>Assigned</th><th>Due by</th><th>Days late</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Missed trainings</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#222;margin:24px;font-size:12px}
h1{font-size:18px;margin:0 0 4px}p.sub{color:#666;margin:0 0 16px}
section{break-inside:avoid;margin-bottom:16px}
h2{font-size:14px;margin:0 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px}
h2 span{font-weight:normal;color:#666;font-size:12px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #eee}
th{font-size:11px;color:#555;text-transform:uppercase}td.late{color:#b42318;font-weight:600}
</style></head><body>
<h1>Missed trainings</h1>
<p class="sub">Not started and past due · ${people.length} ${people.length === 1 ? "person" : "people"} · ${total} ${total === 1 ? "training" : "trainings"} · Generated ${escapeHtml(generated)}</p>
${sections || "<p>No missed trainings.</p>"}
</body></html>`;
}
