import * as XLSX from "xlsx";
import {
  sanitizeTrainingImportText,
  textQualityScore,
} from "./training-import-text.js";

export type QuestionImportRow = {
  stem: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
  pageRef?: string;
  difficulty?: string;
  status?: "DRAFT" | "PUBLISHED";
};

export type QuestionImportChapter = {
  title: string;
  pageRange?: string;
  questions: QuestionImportRow[];
};

export type QuestionImportPayload = {
  chapters: QuestionImportChapter[];
};

function asText(value: unknown): string {
  const raw =
    typeof value === "string" ? value : value == null ? "" : String(value);
  return sanitizeTrainingImportText(raw);
}

function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[_-]+/g, "")
    .replace(/\s+/g, "");
}

function headerMatches(key: string, aliases: string[]): boolean {
  const normalized = normalizeHeaderKey(key);
  return aliases.some((alias) => normalized === normalizeHeaderKey(alias));
}

function detectCsvDelimiter(headerLine: string): "," | ";" | "\t" {
  const comma = (headerLine.match(/,/g) ?? []).length;
  const semicolon = (headerLine.match(/;/g) ?? []).length;
  const tab = (headerLine.match(/\t/g) ?? []).length;
  if (semicolon > comma && semicolon >= tab) return ";";
  if (tab > comma && tab > semicolon) return "\t";
  return ",";
}

function letterToIndex(value: string): number | null {
  const letter = value.trim().toUpperCase();
  if (!/^[A-F]$/.test(letter)) return null;
  return letter.charCodeAt(0) - 65;
}

function normalizeQuestion(row: Record<string, unknown>, index: number, chapterLabel: string): QuestionImportRow {
  const stem = asText(row.stem ?? row.question ?? row.prompt);
  if (!stem) {
    throw new Error(`${chapterLabel}: question ${index + 1} is missing stem`);
  }
  let choices: string[] = [];
  if (Array.isArray(row.choices)) {
    choices = row.choices.map((c) => asText(c)).filter(Boolean);
  } else if (typeof row.choices === "string") {
    choices = row.choices
      .split(/[|;/]/)
      .map((c) => c.trim())
      .filter(Boolean);
  } else {
    const numbered = [
      row.choice1,
      row.choice2,
      row.choice3,
      row.choice4,
      row.choice5,
      row.choice6,
      row.choiceA,
      row.choiceB,
      row.choiceC,
      row.choiceD,
    ]
      .map((c) => asText(c))
      .filter(Boolean);
    if (numbered.length) choices = numbered;
  }
  if (choices.length < 2) {
    throw new Error(`${chapterLabel}: question ${index + 1} needs at least 2 choices`);
  }
  const correctRaw = row.correctIndex ?? row.correct ?? row.answerIndex ?? row.answer;
  let correctIndex = Number(correctRaw ?? 0);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
    const fromLetter = typeof correctRaw === "string" ? letterToIndex(correctRaw) : null;
    if (fromLetter != null && fromLetter < choices.length) {
      correctIndex = fromLetter;
    } else {
      throw new Error(`${chapterLabel}: question ${index + 1} has invalid correct answer`);
    }
  }
  const question: QuestionImportRow = { stem, choices, correctIndex };
  const explanation = asText(row.explanation);
  const pageRef = asText(row.pageRef ?? row.page);
  const difficulty = asText(row.difficulty);
  if (explanation) question.explanation = explanation;
  if (pageRef) question.pageRef = pageRef;
  if (difficulty) question.difficulty = difficulty;
  return question;
}

function parseQuestionBlock(block: string, questionNumber?: number): QuestionImportRow | null {
  const lines = block
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) return null;

  let stem = lines[0]!
    .replace(/^(?:Q\s*)?\d+[\).:\]]\s*/i, "")
    .replace(/^\d+[\).:\]]\s*/, "")
    .trim();
  const choices: string[] = [];
  let correctIndex: number | null = null;
  let explanation = "";
  let pageRef = "";

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    const answerMatch = line.match(
      /^(?:correct\s*)?answer(?:\s*key)?\s*[:\-]?\s*([A-Fa-f]|\d+)\s*$/i,
    );
    if (answerMatch) {
      const raw = answerMatch[1]!;
      const asNum = Number(raw);
      correctIndex =
        Number.isInteger(asNum) && asNum >= 0
          ? asNum
          : (letterToIndex(raw) ?? correctIndex);
      continue;
    }
    const explainMatch = line.match(/^explanation\s*[:\-]\s*(.+)$/i);
    if (explainMatch) {
      explanation = explainMatch[1]!.trim();
      continue;
    }
    const pageMatch = line.match(/^(?:page|ref)\s*[:\-]\s*(.+)$/i);
    if (pageMatch) {
      pageRef = pageMatch[1]!.trim();
      continue;
    }
    const choiceMatch = line.match(/^([A-Fa-f])[\).:\]]\s+(.+)$/);
    if (choiceMatch) {
      choices.push(choiceMatch[2]!.trim());
      continue;
    }
    const numberedChoice = line.match(/^\(\s*([A-Fa-f])\s*\)\s+(.+)$/);
    if (numberedChoice) {
      choices.push(numberedChoice[2]!.trim());
      continue;
    }
    if (!choices.length && stem) {
      stem = `${stem} ${line}`.trim();
    } else if (choices.length) {
      choices[choices.length - 1] = `${choices[choices.length - 1]} ${line}`.trim();
    }
  }

  if (!stem || choices.length < 2) return null;
  if (correctIndex == null || correctIndex < 0 || correctIndex >= choices.length) {
    correctIndex = 0;
  }
  const row: QuestionImportRow = { stem, choices, correctIndex };
  if (explanation) row.explanation = explanation;
  if (pageRef) row.pageRef = pageRef;
  else if (questionNumber != null) row.pageRef = String(questionNumber);
  return row;
}

export function parseQuestionImportText(
  text: string,
  defaultChapterTitle = "Imported from PDF",
): QuestionImportPayload {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
  if (!normalized) {
    throw new Error("Document contained no readable text");
  }

  const blocks = normalized
    .split(/(?=^\s*(?:(?:Q\s*)?\d+[\).:\]]\s+))/m)
    .map((block) => block.trim())
    .filter(Boolean);

  const questions: QuestionImportRow[] = [];
  if (blocks.length > 1 || /^\s*(?:(?:Q\s*)?\d+[\).:\]])/m.test(normalized)) {
    for (const block of blocks) {
      const numberMatch = block.match(/^(?:Q\s*)?(\d+)[\).:\]]/i);
      const questionNumber = numberMatch ? Number(numberMatch[1]) : undefined;
      const parsed = parseQuestionBlock(block, questionNumber);
      if (parsed) questions.push(parsed);
    }
  }

  if (!questions.length) {
    const fallbackBlocks = normalized
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => /[A-Da-d][\).:\]]/.test(block));
    for (const block of fallbackBlocks) {
      const parsed = parseQuestionBlock(block);
      if (parsed) questions.push(parsed);
    }
  }

  if (!questions.length) {
    throw new Error(
      "Could not find quiz questions in the document. Use numbered questions with A/B/C/D choices, or upload CSV instead.",
    );
  }

  return {
    chapters: [{ title: defaultChapterTitle, questions }],
  };
}

export function parseQuestionImportCsv(text: string): QuestionImportPayload {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one question row");
  }

  const delimiter = detectCsvDelimiter(lines[0]!);

  function parseCsvLine(line: string): string[] {
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

  const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const chapterIdx = headers.indexOf("chapter");
  const pageRangeIdx = headers.indexOf("pagerange");
  const stemIdx = headers.findIndex((h) => h === "stem" || h === "question");
  const correctIdx = headers.findIndex(
    (h) => h === "correctindex" || h === "correct" || h === "answer",
  );
  const choicesIdx = headers.indexOf("choices");
  const explanationIdx = headers.indexOf("explanation");
  const pageRefIdx = headers.findIndex((h) => h === "pageref" || h === "page");
  const statusIdx = headers.indexOf("status");
  const difficultyIdx = headers.indexOf("difficulty");
  const choiceIndices = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /^choice\d+$/.test(header) || /^choice[a-f]$/.test(header));

  if (stemIdx === -1) throw new Error('CSV header must include a "stem" column');
  if (correctIdx === -1) throw new Error('CSV header must include a "correctIndex" or "correct" column');
  if (!choiceIndices.length && choicesIdx === -1) {
    throw new Error('CSV header must include choice columns (choice1, choice2, …) or a "choices" column');
  }

  const byChapter = new Map<string, QuestionImportChapter>();
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const cells = parseCsvLine(lines[rowIndex]!);
    const chapterTitle =
      chapterIdx >= 0 ? cells[chapterIdx]?.trim() || `Chapter ${rowIndex}` : "Imported questions";
    const pageRange = pageRangeIdx >= 0 ? cells[pageRangeIdx]?.trim() : "";
    const choices =
      choicesIdx >= 0
        ? (cells[choicesIdx] ?? "")
            .split(/[|;/]/)
            .map((value) => value.trim())
            .filter(Boolean)
        : choiceIndices
            .map(({ index }) => cells[index]?.trim() ?? "")
            .filter((value) => value !== "");
    const row: Record<string, unknown> = {
      stem: cells[stemIdx] ?? "",
      choices,
      correct: cells[correctIdx] ?? "0",
      explanation: explanationIdx >= 0 ? cells[explanationIdx] : "",
      pageRef: pageRefIdx >= 0 ? cells[pageRefIdx] : "",
      status: statusIdx >= 0 ? cells[statusIdx] : "",
      difficulty: difficultyIdx >= 0 ? cells[difficultyIdx] : "",
    };
    const question = normalizeQuestion(row, rowIndex - 1, chapterTitle);
    const existing = byChapter.get(chapterTitle);
    if (existing) {
      existing.questions.push(question);
      if (!existing.pageRange && pageRange) existing.pageRange = pageRange;
    } else {
      const chapter: QuestionImportChapter = { title: chapterTitle, questions: [question] };
      if (pageRange) chapter.pageRange = pageRange;
      byChapter.set(chapterTitle, chapter);
    }
  }
  const chapters = [...byChapter.values()];
  if (!chapters.length) throw new Error("No questions found in CSV");
  return { chapters };
}

function xlsxCellToText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  const toSanitized = (value: string) => sanitizeTrainingImportText(value);

  if (typeof cell.w === "string" && cell.w.length) return toSanitized(cell.w);

  const rich = cell.r as unknown;
  if (Array.isArray(rich)) {
    const joined = rich
      .map((run) => {
        if (run && typeof run === "object" && "t" in run) {
          return String((run as { t?: unknown }).t ?? "");
        }
        return "";
      })
      .join("");
    if (joined) return toSanitized(joined);
  } else if (typeof rich === "string" && rich.length) {
    return toSanitized(rich);
  }

  const value = cell.v;
  if (value == null) return "";
  if (typeof value === "string") return toSanitized(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return toSanitized(String(value));
}

function sheetToRecords(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  if (range.e.r <= range.s.r) return [];

  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    headers.push(xlsxCellToText(sheet[addr]));
  }

  const rows: Record<string, unknown>[] = [];
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const record: Record<string, unknown> = {};
    let hasValue = false;
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const header = headers[col - range.s.c]?.trim();
      if (!header) continue;
      const addr = XLSX.utils.encode_cell({ r: row, c: col });
      const text = xlsxCellToText(sheet[addr]);
      if (text) hasValue = true;
      record[header] = text;
    }
    if (hasValue) rows.push(record);
  }
  return rows;
}

function isLegacyXlsBuffer(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer[0] === 0xd0 && buffer[1] === 0xcf;
}

function readExcelWorkbook(buffer: Buffer): XLSX.WorkBook {
  const readOpts = { type: "buffer" as const, cellText: true, cellDates: false };
  if (!isLegacyXlsBuffer(buffer)) {
    return XLSX.read(buffer, readOpts);
  }

  const candidates: XLSX.WorkBook[] = [];
  for (const codepage of [1252, 28591, 65001]) {
    try {
      candidates.push(XLSX.read(buffer, { ...readOpts, codepage }));
    } catch {
      // try next codepage
    }
  }
  try {
    candidates.push(XLSX.read(buffer, readOpts));
  } catch {
    // handled below
  }
  if (!candidates.length) {
    return XLSX.read(buffer, readOpts);
  }

  return candidates.reduce((best, candidate) => {
    const bestSheet = best.SheetNames[0] ? best.Sheets[best.SheetNames[0]!] : undefined;
    const candidateSheet = candidate.SheetNames[0] ? candidate.Sheets[candidate.SheetNames[0]!] : undefined;
    const bestScore = scoreSheetRecords(bestSheet ? sheetToRecords(bestSheet) : []);
    const candidateScore = scoreSheetRecords(candidateSheet ? sheetToRecords(candidateSheet) : []);
    return candidateScore < bestScore ? candidate : best;
  });
}

function scoreSheetRecords(rows: Record<string, unknown>[]): number {
  let score = 0;
  for (const row of rows) {
    for (const value of Object.values(row)) {
      score += textQualityScore(asText(value));
    }
  }
  return score;
}

function mapExcelRowToImportRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const letterChoices: { letter: string; value: string }[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (value == null || value === "") continue;
    const normalizedKey = normalizeHeaderKey(key);
    if (headerMatches(key, ["chapter", "chapter title", "ch"])) {
      out.chapter = value;
      continue;
    }
    if (headerMatches(key, ["stem", "question", "prompt", "question text", "quiz question"])) {
      out.stem = value;
      continue;
    }
    if (
      headerMatches(key, [
        "correct",
        "correct index",
        "correctindex",
        "correct answer",
        "answer",
        "answer key",
        "key",
      ])
    ) {
      out.correct = value;
      continue;
    }
    if (headerMatches(key, ["choices", "options"])) {
      out.choices = value;
      continue;
    }
    if (headerMatches(key, ["explanation", "explain", "feedback"])) {
      out.explanation = value;
      continue;
    }
    if (headerMatches(key, ["page ref", "pageref", "page", "page reference"])) {
      out.pageRef = value;
      continue;
    }
    if (headerMatches(key, ["status"])) {
      out.status = value;
      continue;
    }
    if (headerMatches(key, ["difficulty", "level"])) {
      out.difficulty = value;
      continue;
    }
    const numberedChoice = normalizedKey.match(/^(?:choice|option|answer)(\d+)$/);
    if (numberedChoice) {
      out[`choice${numberedChoice[1]}`] = value;
      continue;
    }
    const letterChoice = normalizedKey.match(/^(?:choice|option|answer)?([a-f])$/);
    if (letterChoice) {
      letterChoices.push({ letter: letterChoice[1]!, value: asText(value) });
    }
  }

  if (!out.choices && letterChoices.length) {
    letterChoices.sort((a, b) => a.letter.localeCompare(b.letter));
    out.choices = letterChoices.map((entry) => entry.value).filter(Boolean);
  }

  return out;
}

export function parseQuestionImportXlsx(buffer: Buffer): QuestionImportPayload {
  const workbook = readExcelWorkbook(buffer);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel workbook has no sheets");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Excel workbook sheet is empty");

  const rawRows = sheetToRecords(sheet);
  if (!rawRows.length) throw new Error("Excel sheet has no question rows");

  const byChapter = new Map<string, QuestionImportChapter>();
  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const mapped = mapExcelRowToImportRecord(rawRows[rowIndex]!);
    if (!asText(mapped.stem ?? mapped.question)) continue;
    const chapterTitle = asText(mapped.chapter) || "Imported questions";
    const question = normalizeQuestion(mapped, rowIndex, chapterTitle);
    const existing = byChapter.get(chapterTitle);
    if (existing) {
      existing.questions.push(question);
    } else {
      byChapter.set(chapterTitle, { title: chapterTitle, questions: [question] });
    }
  }

  const chapters = [...byChapter.values()];
  if (!chapters.length) {
    throw new Error(
      'Excel sheet must include a "Question" (or "stem") column plus answer choices and a correct answer column.',
    );
  }
  return { chapters };
}

export function flattenImportQuestions(payload: QuestionImportPayload): QuestionImportRow[] {
  return payload.chapters.flatMap((chapter) => chapter.questions ?? []);
}

export function chaptersFromImportPayload(
  payload: QuestionImportPayload,
  chapterTitle?: string,
): QuestionImportPayload {
  if (!chapterTitle?.trim()) return payload;
  const title = chapterTitle.trim();
  return {
    chapters: [
      {
        title,
        questions: payload.chapters.flatMap((chapter) => chapter.questions),
      },
    ],
  };
}
