/**
 * Year-friendly date entry: month / day / year selects instead of a native
 * calendar that opens on the current year (painful for dates of birth).
 */

const MONTHS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export type DateFieldMode = "default" | "birth";

export function isBirthDateField(input: { id?: string; label?: string; name?: string }): boolean {
  const hay = `${input.id ?? ""} ${input.label ?? ""} ${input.name ?? ""}`.toLowerCase();
  return /\b(date\s*of\s*birth|birth\s*date|dob|birthday)\b/.test(hay) || /dateofbirth|date_of_birth/.test(hay);
}

export function daysInMonth(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

export function parseIsoDateParts(value: string): { year: string; month: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return { year: "", month: "", day: "" };
  return { year: match[1]!, month: match[2]!, day: match[3]! };
}

export function buildIsoDate(year: string, month: string, day: string): string {
  if (!year || !month || !day) return "";
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";
  const maxDay = daysInMonth(y, m);
  if (d < 1 || d > maxDay || m < 1 || m > 12) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function yearOptionsForMode(mode: DateFieldMode, now = new Date()): number[] {
  const current = now.getFullYear();
  if (mode === "birth") {
    const oldest = current - 110;
    const newest = current; // allow today; validation elsewhere can enforce 21+
    const years: number[] = [];
    for (let y = newest; y >= oldest; y -= 1) years.push(y);
    return years;
  }
  const newest = current + 10;
  const oldest = current - 80;
  const years: number[] = [];
  for (let y = newest; y >= oldest; y -= 1) years.push(y);
  return years;
}

export function dateFieldModeFor(input: { id?: string; label?: string; name?: string }): DateFieldMode {
  return isBirthDateField(input) ? "birth" : "default";
}

export { MONTHS };
