import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseQuestionImportCsv,
  parseQuestionImportText,
  parseQuestionImportXlsx,
} from "./training-question-import.js";
describe("parseQuestionImportText", () => {
  it("parses numbered questions with letter choices", () => {
    const payload = parseQuestionImportText(
      [
        "1. What is lockout/tagout for?",
        "A) Speed up repairs",
        "B) Control hazardous energy",
        "C) Replace PPE",
        "D) Track production",
        "Answer: B",
        "",
        "2. Who can remove a lock?",
        "A) Anyone nearby",
        "B) Only the person who applied it",
        "Answer: B",
      ].join("\n"),
      "Safety",
    );
    expect(payload.chapters[0]?.title).toBe("Safety");
    expect(payload.chapters[0]?.questions).toHaveLength(2);
    expect(payload.chapters[0]?.questions[0]?.correctIndex).toBe(1);
  });
});

describe("parseQuestionImportXlsx", () => {
  it("parses question rows with flexible Excel headers", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Chapter", "Question", "A", "B", "C", "D", "Correct"],
      [
        "Safety",
        "What is LOTO for?",
        "Speed up repairs",
        "Control energy",
        "Replace PPE",
        "Track metrics",
        "B",
      ],
      ["Safety", "Who removes a lock?", "Anyone", "Only the installer", "", "", "B"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Quiz");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const payload = parseQuestionImportXlsx(buffer);
    expect(payload.chapters[0]?.questions).toHaveLength(2);
    expect(payload.chapters[0]?.questions[0]?.correctIndex).toBe(1);
  });

  it("repairs mojibake question text from Excel cells", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Question", "A", "B", "Correct"],
      ["What is the worker\u00E2\u20AC\u2122s responsibility?", "Ignore it", "Follow LOTO", "B"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Quiz");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const payload = parseQuestionImportXlsx(buffer);
    const stem = payload.chapters[0]?.questions[0]?.stem ?? "";
    expect(stem).toContain("worker");
    expect(stem).toContain("s responsibility");
    expect(stem).not.toContain("\uFFFD");
    expect(stem).not.toMatch(/â€™/);
  });
});

describe("parseQuestionImportCsv", () => {
  it("accepts semicolon-delimited exports", () => {
    const payload = parseQuestionImportCsv(
      ["chapter;stem;correct;choice1;choice2", "Basics;First question?;B;Yes;No"].join("\n"),
    );
    expect(payload.chapters[0]?.questions[0]?.correctIndex).toBe(1);
  });
  it("accepts correct answers as letters", () => {
    const payload = parseQuestionImportCsv(
      ["chapter,stem,correct,choice1,choice2", "Basics,First question?,B,Yes,No"].join("\n"),
    );
    expect(payload.chapters[0]?.questions[0]?.correctIndex).toBe(1);
  });

  it("accepts pipe-separated choices column", () => {
    const payload = parseQuestionImportCsv(
      ["stem,correct,choices", "Pick one,B,Red|Blue|Green"].join("\n"),
    );
    expect(payload.chapters[0]?.questions[0]?.choices).toEqual(["Red", "Blue", "Green"]);
    expect(payload.chapters[0]?.questions[0]?.correctIndex).toBe(1);
  });
});
