/**
 * Parse Excel, CSV, or PDF text into Yes / No / N/A checklist form fields.
 */
import * as XLSX from "xlsx";

export type ChecklistImportField = {
  id: string;
  label: string;
  type: "yesno";
  options: ["Yes", "No", "N/A"];
  required: true;
  section?: string;
};

export type ChecklistImportResult = {
  title: string;
  category: string | null;
  fields: ChecklistImportField[];
};

function slugId(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug ? `${slug}-${index + 1}` : `item-${index + 1}`;
}

function asCellText(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[_-]+/g, "")
    .replace(/\s+/g, "");
}

function headerIsQuestion(key: string): boolean {
  const n = normalizeHeaderKey(key);
  return (
    n === "question" ||
    n === "label" ||
    n === "item" ||
    n === "prompt" ||
    n === "checklistitem" ||
    n === "description"
  );
}

function headerIsSection(key: string): boolean {
  const n = normalizeHeaderKey(key);
  return n === "section" || n === "category" || n === "group" || n === "area";
}

function toChecklistField(label: string, index: number, section?: string): ChecklistImportField {
  const field: ChecklistImportField = {
    id: slugId(label, index),
    label,
    type: "yesno",
    options: ["Yes", "No", "N/A"],
    required: true,
  };
  if (section) field.section = section;
  return field;
}

/**
 * Many mill checklists put section titles in column A and questions in column B
 * (section row has A only; question rows have B only). Detect that outline layout.
 */
function detectOutlineSectionLayout(rows: unknown[][], startRow: number): boolean {
  let sectionOnly = 0;
  let questionOnly = 0;
  let both = 0;
  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const col0 = asCellText(row[0]);
    const col1 = asCellText(row[1]);
    if (!col0 && !col1) continue;
    if (col0 && !col1) sectionOnly += 1;
    else if (!col0 && col1) questionOnly += 1;
    else both += 1;
  }
  return questionOnly >= 3 && sectionOnly >= 1 && questionOnly > both;
}

/** Parse rows where col A = section heading, col B = question. */
function parseOutlineSectionRows(
  rows: unknown[][],
  startRow: number,
  defaultTitle: string,
): ChecklistImportResult {
  const fields: ChecklistImportField[] = [];
  let currentSection = "";
  let title = defaultTitle;

  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const col0 = asCellText(row[0]);
    const col1 = asCellText(row[1]);
    if (!col0 && !col1) continue;

    if (col0 && !col1) {
      currentSection = col0;
      if (fields.length === 0 && !title) title = col0;
      continue;
    }

    const label = col1 || col0;
    if (!label) continue;
    const section = col1 && col0 ? col0 : currentSection;
    if (col1 && col0) currentSection = col0;
    fields.push(toChecklistField(label, fields.length, section || undefined));
  }

  if (fields.length === 0) {
    throw new Error(
      "No questions found in Excel. Put section headings in column A and questions in column B.",
    );
  }
  return { title, category: null, fields };
}

/** Extract checklist question lines from plain text (PDF extraction). */
export function parseChecklistText(
  text: string,
  defaultTitle = "Imported checklist",
): ChecklistImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const labels: string[] = [];
  let title = defaultTitle;

  for (const line of lines) {
    if (/^form\s*name\s*[:]/i.test(line)) {
      title = line.split(/[:]/).slice(1).join(":").trim() || title;
      continue;
    }
    if (/^title\s*[:]/i.test(line)) {
      title = line.split(/[:]/).slice(1).join(":").trim() || title;
      continue;
    }
  }

  for (const line of lines) {
    if (/^form\s*name\s*[:]/i.test(line) || /^title\s*[:]/i.test(line)) continue;
    if (/^yes\s*no\s*n\/?a/i.test(line)) continue;
    if (/^section\s*[:]/i.test(line)) continue;

    const stripped = line
      .replace(/^(?:Q\s*)?\d+[.):-]\s*/i, "")
      .replace(/^[-•*]\s+/, "")
      .trim();
    if (stripped.length < 4) continue;
    if (/^(page|section|category)\s*[:]/i.test(stripped)) continue;
    labels.push(stripped);
  }

  if (labels.length === 0) {
    throw new Error(
      "No checklist questions found. Use numbered lines, bullets, or an Excel column headed Question.",
    );
  }

  return {
    title,
    category: null,
    fields: labels.map((label, index) => toChecklistField(label, index)),
  };
}

export function parseChecklistCsv(
  text: string,
  defaultTitle = "Imported checklist",
): ChecklistImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one question row");
  }

  const delimiter =
    (lines[0]!.match(/;/g) ?? []).length > (lines[0]!.match(/,/g) ?? []).length ? ";" : ",";

  function parseLine(line: string): string[] {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  }

  const headers = parseLine(lines[0]!);
  const questionIdx = headers.findIndex((h) => headerIsQuestion(h));
  const sectionIdx = headers.findIndex((h) => headerIsSection(h));
  const titleIdx = headers.findIndex(
    (h) => normalizeHeaderKey(h) === "formname" || normalizeHeaderKey(h) === "title",
  );

  if (questionIdx < 0) {
    // No header — treat first column as questions.
    const labels = lines
      .map((line) => parseLine(line)[0]?.trim())
      .filter((label): label is string => Boolean(label));
    if (labels.length < 1) throw new Error("Could not find questions in CSV");
    return {
      title: defaultTitle,
      category: null,
      fields: labels.map((label, index) => toChecklistField(label, index)),
    };
  }

  let title = defaultTitle;
  const fields: ChecklistImportField[] = [];
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const cells = parseLine(lines[rowIndex]!);
    const label = asCellText(cells[questionIdx]);
    if (!label) continue;
    if (titleIdx >= 0 && rowIndex === 1 && cells[titleIdx]) title = asCellText(cells[titleIdx]);
    const section = sectionIdx >= 0 ? asCellText(cells[sectionIdx]) : "";
    fields.push(toChecklistField(label, fields.length, section || undefined));
  }

  if (fields.length === 0) throw new Error("No questions found in CSV rows");
  return { title, category: null, fields };
}

export function parseChecklistXlsx(
  buffer: Buffer,
  defaultTitle = "Imported checklist",
): ChecklistImportResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName =
    workbook.SheetNames.find((name) => /inspect|question|checklist/i.test(name)) ??
    workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no worksheets");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Excel worksheet is empty");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  if (!rows.length) throw new Error("Excel worksheet is empty");

  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((cell) => asCellText(cell));
  const questionIdx = headers.findIndex((h) => headerIsQuestion(h));
  const sectionIdx = headers.findIndex((h) => headerIsSection(h));
  const titleIdx = headers.findIndex(
    (h) => normalizeHeaderKey(h) === "formname" || normalizeHeaderKey(h) === "title",
  );

  const hasQuestionHeader = questionIdx >= 0;
  const startRow = hasQuestionHeader ? 1 : 0;

  // Outline layout: section titles in col A, questions in col B (no Question header).
  if (!hasQuestionHeader && detectOutlineSectionLayout(rows, startRow)) {
    const parsed = parseOutlineSectionRows(rows, startRow, defaultTitle);
    return { ...parsed, title: sheetName !== "Sheet1" ? sheetName : parsed.title };
  }

  const fields: ChecklistImportField[] = [];
  let title = defaultTitle;

  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const questionCol = questionIdx >= 0 ? questionIdx : 0;
    const label = asCellText(row[questionCol]);
    if (!label) continue;
    if (titleIdx >= 0 && rowIndex === 1 && asCellText(row[titleIdx])) {
      title = asCellText(row[titleIdx]);
    }
    const section =
      sectionIdx >= 0 ? asCellText(row[sectionIdx]) : questionIdx >= 0 ? "" : asCellText(row[1]);
    fields.push(toChecklistField(label, fields.length, section || undefined));
  }

  if (fields.length === 0) {
    throw new Error(
      "No questions found in Excel. Put each question in the first column, or use a Question header.",
    );
  }

  return { title, category: null, fields };
}

export function parseChecklistFile(
  buffer: Buffer,
  filename: string,
  pdfText?: string,
): ChecklistImportResult {
  const lower = filename.trim().toLowerCase();
  const stem = filename.replace(/\.[^.]+$/, "").trim() || "Imported checklist";

  if (lower.endsWith(".pdf")) {
    if (!pdfText?.trim()) throw new Error("Could not extract text from PDF");
    return parseChecklistText(pdfText, stem);
  }
  if (lower.endsWith(".csv")) {
    return parseChecklistCsv(buffer.toString("utf8"), stem);
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseChecklistXlsx(buffer, stem);
  }
  throw new Error("Unsupported file type. Upload Excel (.xlsx), CSV, or PDF.");
}

export function checklistToFormTemplate(
  parsed: ChecklistImportResult,
  sourceDocumentId: string,
): {
  sourceDocumentId: string;
  sourceCollection: string;
  data: Record<string, unknown>;
} {
  return {
    sourceDocumentId,
    sourceCollection: "formTemplates",
    data: {
      name: parsed.title,
      title: parsed.title,
      category: parsed.category,
      fields: parsed.fields.map((field) => ({
        id: field.id,
        label: field.label,
        type: "yesno",
        options: field.options,
        required: true,
        ...(field.section ? { section: field.section } : {}),
      })),
    },
  };
}
