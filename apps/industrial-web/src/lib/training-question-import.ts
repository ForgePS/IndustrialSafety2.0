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

export const QUESTION_IMPORT_JSON_TEMPLATE: QuestionImportPayload = {
  chapters: [
    {
      title: "Chapter 1",
      pageRange: "1-10",
      questions: [
        {
          stem: "What is the primary purpose of lockout/tagout?",
          choices: [
            "To speed up equipment repairs",
            "To control hazardous energy during service",
            "To replace PPE requirements",
            "To document production metrics",
          ],
          correctIndex: 1,
          explanation: "LOTO isolates hazardous energy so work can be performed safely.",
          pageRef: "1",
          status: "DRAFT",
        },
      ],
    },
  ],
};

function asText(value: unknown): string {
  return sanitizeTrainingImportText(
    typeof value === "string" ? value : value == null ? "" : String(value),
  );
}

function stripDisallowedControlChars(text: string): string {
  return [...text]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(
        code === 0 ||
        (code >= 1 && code <= 8) ||
        code === 11 ||
        code === 12 ||
        (code >= 14 && code <= 31)
      );
    })
    .join("");
}

const CP1252_HIGH_BYTES: Record<number, string> = {
  0x80: "\u20AC",
  0x82: "\u201A",
  0x83: "\u0192",
  0x84: "\u201E",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02C6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017D",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201C",
  0x94: "\u201D",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02DC",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203A",
  0x9c: "\u0153",
  0x9e: "\u017E",
  0x9f: "\u0178",
};

const CP1252_UNICODE_TO_BYTE = new Map<number, number>(
  Object.entries(CP1252_HIGH_BYTES).map(([byte, ch]) => [ch.charCodeAt(0), Number(byte)]),
);

function encodeWindows1252(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7f) {
      bytes.push(code);
      continue;
    }
    if (code >= 0xa0 && code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const mapped = CP1252_UNICODE_TO_BYTE.get(code);
    bytes.push(mapped ?? code & 0xff);
  }
  return Uint8Array.from(bytes);
}

function repairUtf8Mojibake(text: string): string {
  if (!text) return "";
  let current = text;
  for (let pass = 0; pass < 2; pass += 1) {
    if (!/[\u00C0-\u00FF]|â|Ã|Â|[\u0080-\u009F]/.test(current) && !current.includes("\uFFFD")) break;
    try {
      const repaired = new TextDecoder("utf-8", { fatal: false }).decode(encodeWindows1252(current));
      if (repaired && !repaired.includes("\uFFFD")) current = repaired;
    } catch {
      // ignore
    }
  }
  return current;
}

function sanitizeTrainingImportText(text: string): string {
  const current = repairUtf8Mojibake(text);
  return stripDisallowedControlChars(current)
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u0080-\u009F]/g, (ch) => CP1252_HIGH_BYTES[ch.charCodeAt(0)] ?? "")
    .replace(/â€™|â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\u009d/g, '"')
    .replace(/â€"/g, "—")
    .replace(/â€"/g, "–")
    .replace(/â€¦/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/Â(?=[\s!?,.)}\]]|$)/g, "")
    .replace(/\uFFFD/g, "")
    .normalize("NFC")
    .trim();
}

function normalizeStatus(value: unknown): "DRAFT" | "PUBLISHED" | undefined {
  const status = asText(value).toUpperCase();
  if (status === "PUBLISHED") return "PUBLISHED";
  if (status === "DRAFT") return "DRAFT";
  return undefined;
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
  const status = normalizeStatus(row.status);
  if (explanation) question.explanation = explanation;
  if (pageRef) question.pageRef = pageRef;
  if (difficulty) question.difficulty = difficulty;
  if (status) question.status = status;
  return question;
}

function normalizeChapter(row: Record<string, unknown>, index: number): QuestionImportChapter {
  const title = asText(row.title ?? row.chapter ?? row.chapterTitle) || `Chapter ${index + 1}`;
  const pageRange = asText(row.pageRange ?? row.pages);
  const rawQuestions = Array.isArray(row.questions) ? row.questions : [];
  if (!rawQuestions.length) {
    throw new Error(`Chapter "${title}" has no questions`);
  }
  const questions = rawQuestions.map((q, qIndex) =>
    normalizeQuestion(q as Record<string, unknown>, qIndex, title),
  );
  const chapter: QuestionImportChapter = { title, questions };
  if (pageRange) chapter.pageRange = pageRange;
  return chapter;
}

export function parseQuestionImportJson(text: string): QuestionImportPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Import file must be a JSON object");
  }
  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.chapters)) {
    const chapters = root.chapters.map((chapter, index) =>
      normalizeChapter(chapter as Record<string, unknown>, index),
    );
    if (!chapters.length) throw new Error("No chapters found in import file");
    return { chapters };
  }
  if (Array.isArray(root.questions)) {
    const title = asText(root.chapterTitle ?? root.title ?? root.chapter) || "Imported questions";
    const pageRange = asText(root.pageRange ?? root.pages);
    const questions = root.questions.map((q, index) =>
      normalizeQuestion(q as Record<string, unknown>, index, title),
    );
    const chapter: QuestionImportChapter = { title, questions };
    if (pageRange) chapter.pageRange = pageRange;
    return { chapters: [chapter] };
  }
  throw new Error('JSON must include a "chapters" array or top-level "questions" array');
}

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
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function parseQuestionImportCsv(text: string): QuestionImportPayload {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one question row");
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
  if (correctIdx === -1) {
    throw new Error('CSV header must include a "correctIndex" or "correct" column');
  }
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

export function parseQuestionImportFile(filename: string, text: string): QuestionImportPayload {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return parseQuestionImportCsv(text);
  return parseQuestionImportJson(text);
}

export const QUESTION_IMPORT_CSV_TEMPLATE = [
  "chapter,stem,correct,choice1,choice2,choice3,choice4,explanation,pageRef",
  "Safety,What is the primary purpose of lockout/tagout?,B,Speed up repairs,Control hazardous energy,Replace PPE,Document production metrics,LOTO isolates hazardous energy,12",
].join("\n");

export function downloadQuestionImportTemplate() {
  const blob = new Blob([JSON.stringify(QUESTION_IMPORT_JSON_TEMPLATE, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "training-quiz-template.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadQuestionImportCsvTemplate() {
  const blob = new Blob([QUESTION_IMPORT_CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "training-quiz-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Import a quiz/test bank file into a course (CSV, Excel, JSON, or PDF). */
export async function importTrainingQuizFile(
  sourceId: string,
  file: File,
  defaultStatus: "DRAFT" | "PUBLISHED" = "PUBLISHED",
): Promise<{ questionsCreated: number }> {
  const { fileToBase64 } = await import("@/lib/binary");
  const { trainingApi } = await import("@/features/training/api");
  const lower = file.name.toLowerCase();
  if (
    lower.endsWith(".pdf") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  ) {
    const contentBase64 = await fileToBase64(file);
    return trainingApi.importQuestionsFromFile(sourceId, {
      filename: file.name,
      contentBase64,
      defaultStatus,
    });
  }
  const text = await file.text();
  const payload = parseQuestionImportFile(file.name, text);
  return trainingApi.importQuestions(sourceId, {
    chapters: payload.chapters,
    defaultStatus,
  });
}
