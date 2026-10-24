import { describe, expect, it } from "vitest";
import { parseQuestionImportCsv, parseQuestionImportJson } from "./training-question-import";

describe("parseQuestionImportJson", () => {
  it("parses chapters with questions", () => {
    const payload = parseQuestionImportJson(
      JSON.stringify({
        chapters: [
          {
            title: "Basics",
            questions: [
              {
                stem: "Q1?",
                choices: ["A", "B"],
                correctIndex: 0,
              },
            ],
          },
        ],
      }),
    );
    expect(payload.chapters).toHaveLength(1);
    expect(payload.chapters[0]?.title).toBe("Basics");
    expect(payload.chapters[0]?.questions[0]?.stem).toBe("Q1?");
  });

  it("parses flat questions array", () => {
    const payload = parseQuestionImportJson(
      JSON.stringify({
        chapterTitle: "Review",
        questions: [{ stem: "Q?", choices: ["Yes", "No"], correctIndex: 1 }],
      }),
    );
    expect(payload.chapters[0]?.title).toBe("Review");
    expect(payload.chapters[0]?.questions).toHaveLength(1);
  });
});

describe("parseQuestionImportCsv", () => {
  it("groups rows by chapter", () => {
    const payload = parseQuestionImportCsv(
      [
        "chapter,stem,correctIndex,choice1,choice2",
        "Safety,First question?,0,Yes,No",
        "Safety,Second question?,1,Red,Blue",
        "PPE,Gloves?,0,Latex,Nitrile",
      ].join("\n"),
    );
    expect(payload.chapters).toHaveLength(2);
    expect(payload.chapters.find((c) => c.title === "Safety")?.questions).toHaveLength(2);
  });

  it("accepts correct answers as letters", () => {
    const payload = parseQuestionImportCsv(
      ["chapter,stem,correct,choice1,choice2", "Basics,First question?,B,Yes,No"].join("\n"),
    );
    expect(payload.chapters[0]?.questions[0]?.correctIndex).toBe(1);
  });
});
