import { describe, expect, it } from "vitest";
import {
  absolutizePrintLogoUrl,
  buildPaperQuizPrintableHtml,
  sanitizeQuizDisplayText,
} from "./training-paper-quiz.js";

describe("buildPaperQuizPrintableHtml", () => {
  const questions = [
    {
      stem: "What is LOTO?",
      choices: ["Lockout/Tagout", "Lift only then operate", "Leave on the open"],
      correctIndex: 0,
      pageRef: "12",
    },
  ];

  it("renders a trainee sheet with logo, single choice letters, and no answer line", () => {
    const html = buildPaperQuizPrintableHtml({
      courseTitle: "Safety Basics",
      edition: "2026",
      questions,
      variant: "trainee",
      branding: {
        companyName: "Producers Rice Mill",
        logoUrl: "https://example.com/logo.png",
      },
    });
    expect(html).toContain("<h1>Safety Basics</h1>");
    expect(html).not.toContain("Paper quiz");
    expect(html).toContain('class="logo"');
    expect(html).toContain("https://example.com/logo.png");
    expect(html).toContain('<header class="header">');
    expect(html).toContain("Edition: 2026");
    expect(html.indexOf('class="logo"')).toBeLessThan(html.indexOf("<h1>Safety Basics</h1>"));
    expect(html).toContain("Employee #:");
    expect(html).not.toContain("border: 1px solid");
    expect(html).not.toContain("border-bottom:");
    expect(html).not.toContain("Answer: _______________");
    expect(html).not.toContain('<ol class="choices"');
    expect(html).toContain('<span class="letter">A.</span>');
    expect(html).toContain("What is LOTO?");
    expect(html).not.toContain("✓");
  });

  it("renders an answer key with the correct choice marked", () => {
    const html = buildPaperQuizPrintableHtml({
      courseTitle: "Safety Basics",
      questions,
      variant: "key",
      branding: {
        companyName: "Producers Rice Mill",
        logoUrl: "https://example.com/logo.png",
      },
    });
    expect(html).toContain("Safety Basics - Answer key");
    expect(html).toContain("✓");
    expect(html).toContain('class="correct"');
    expect(html).not.toContain("Employee #:");
  });
});

describe("sanitizeQuizDisplayText", () => {
  it("fixes protective?Toe mojibake", () => {
    expect(sanitizeQuizDisplayText("When is protective?Toe required?")).toBe(
      "When is Protective Toe required?",
    );
  });
});

describe("absolutizePrintLogoUrl", () => {
  it("keeps absolute URLs unchanged", () => {
    expect(absolutizePrintLogoUrl("https://example.com/logo.png")).toBe(
      "https://example.com/logo.png",
    );
  });

  it("prefixes relative URLs with the app base", () => {
    expect(absolutizePrintLogoUrl("/branding/logo.png", "https://app.example.com")).toBe(
      "https://app.example.com/branding/logo.png",
    );
  });
});
