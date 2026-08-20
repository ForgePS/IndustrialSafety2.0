"use client";

import {
  MONTHS,
  buildIsoDate,
  daysInMonth,
  parseIsoDateParts,
  yearOptionsForMode,
  type DateFieldMode,
} from "@/lib/date-field";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  mode?: DateFieldMode;
  className?: string;
};

export function YearSelectDateInput({
  id,
  value,
  onChange,
  required = false,
  disabled = false,
  mode = "default",
  className = "form-control",
}: Props) {
  const parts = parseIsoDateParts(value);
  const baseYears = yearOptionsForMode(mode);
  const selectedYear = parts.year ? Number(parts.year) : NaN;
  const years =
    Number.isFinite(selectedYear) && !baseYears.includes(selectedYear)
      ? [selectedYear, ...baseYears].sort((a, b) => b - a)
      : baseYears;
  const yearNum = parts.year ? Number(parts.year) : 0;
  const monthNum = parts.month ? Number(parts.month) : 0;
  const maxDay = daysInMonth(yearNum || new Date().getFullYear(), monthNum || 1);
  const dayChoices = Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, "0"));

  function emit(next: { year?: string; month?: string; day?: string }) {
    const year = next.year ?? parts.year;
    const month = next.month ?? parts.month;
    let day = next.day ?? parts.day;
    if (year && month && day) {
      const capped = Math.min(Number(day), daysInMonth(Number(year), Number(month)));
      day = String(capped).padStart(2, "0");
    }
    onChange(buildIsoDate(year, month, day));
  }

  const selectClass = className.includes("form-select") ? className : "form-select";

  return (
    <div className="d-flex flex-wrap gap-2" role="group" aria-labelledby={id}>
      <label className="visually-hidden" htmlFor={`${id}-month`}>
        Month
      </label>
      <select
        id={`${id}-month`}
        className={selectClass}
        required={required}
        disabled={disabled}
        value={parts.month}
        onChange={(ev) => emit({ month: ev.target.value })}
        style={{ minWidth: "9.5rem" }}
      >
        <option value="">Month</option>
        {MONTHS.map((month) => (
          <option key={month.value} value={month.value}>
            {month.label}
          </option>
        ))}
      </select>
      <label className="visually-hidden" htmlFor={`${id}-day`}>
        Day
      </label>
      <select
        id={`${id}-day`}
        className={selectClass}
        required={required}
        disabled={disabled}
        value={parts.day && dayChoices.includes(parts.day) ? parts.day : ""}
        onChange={(ev) => emit({ day: ev.target.value })}
        style={{ minWidth: "5.5rem" }}
      >
        <option value="">Day</option>
        {dayChoices.map((day) => (
          <option key={day} value={day}>
            {Number(day)}
          </option>
        ))}
      </select>
      <label className="visually-hidden" htmlFor={`${id}-year`}>
        Year
      </label>
      <select
        id={`${id}-year`}
        className={selectClass}
        required={required}
        disabled={disabled}
        value={parts.year}
        onChange={(ev) => emit({ year: ev.target.value })}
        style={{ minWidth: "6.5rem" }}
      >
        <option value="">Year</option>
        {years.map((year) => (
          <option key={year} value={String(year)}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}
