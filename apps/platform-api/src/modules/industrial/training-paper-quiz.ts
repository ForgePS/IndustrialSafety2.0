/**
 * Build printable HTML for a paper training quiz (trainee sheet or answer key).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type PaperQuizBranding = {
  companyName?: string | null;
  logoUrl?: string | null;
};

export type PaperQuizQuestion = {
  stem: string;
  choices: string[];
  correctIndex?: number | null;
  pageRef?: string | null;
};

export type PaperQuizPrintInput = {
  courseTitle: string;
  edition?: string | null;
  description?: string | null;
  questions: PaperQuizQuestion[];
  variant: "trainee" | "key";
  generatedAt?: Date;
  branding?: PaperQuizBranding;
};

export function absolutizePrintLogoUrl(
  logoUrl: string | null | undefined,
  appBaseUrl?: string | null,
): string | null {
  const url = String(logoUrl ?? "").trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = String(
    appBaseUrl?.trim() ||
      process.env.FORGE_INDUSTRIAL_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://d1n0e5wvjwbpdf.cloudfront.net",
  ).replace(/\/+$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export function sanitizeQuizDisplayText(text: string): string {
  return String(text ?? "")
    .replace(/protective\s*\?\s*Toe/gi, "Protective Toe")
    .replace(/protective\s*\?\s*&\s*Toe/gi, "Protective Toe");
}

export function buildPaperQuizPrintableHtml(input: PaperQuizPrintInput): string {
  const title = input.courseTitle.trim() || "Training quiz";
  const edition = (input.edition ?? "").trim();
  const description = (input.description ?? "").trim();
  const when = (input.generatedAt ?? new Date()).toLocaleString();
  const isKey = input.variant === "key";
  const heading = isKey ? `${title} - Answer key` : title;
  const company = String(input.branding?.companyName ?? "").trim() || "Company";
  const logoUrl = absolutizePrintLogoUrl(input.branding?.logoUrl);
  const logoHtml = logoUrl
    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company)} logo" />`
    : "";
  const metaParts = [
    edition ? `Edition: ${escapeHtml(edition)}` : "",
    `${input.questions.length} question${input.questions.length === 1 ? "" : "s"}`,
    `Generated ${escapeHtml(when)}`,
  ].filter(Boolean);
  const metaHtml = metaParts.join(" · ");

  const questionsHtml = input.questions
    .map((question, index) => {
      const choices = Array.isArray(question.choices) ? question.choices : [];
      const correct =
        typeof question.correctIndex === "number" &&
        question.correctIndex >= 0 &&
        question.correctIndex < choices.length
          ? question.correctIndex
          : null;
      const stem = sanitizeQuizDisplayText(question.stem);
      const choiceItems = choices
        .map((choice, choiceIndex) => {
          const letter = String.fromCharCode(65 + choiceIndex);
          const mark = isKey && correct === choiceIndex ? " ✓" : "";
          const cls = isKey && correct === choiceIndex ? ' class="correct"' : "";
          return `<li${cls}><span class="letter">${letter}.</span> ${escapeHtml(sanitizeQuizDisplayText(String(choice)))}${mark}</li>`;
        })
        .join("");
      const pageRef = (question.pageRef ?? "").trim();
      return `<section class="question">
  <h2>Question ${index + 1}</h2>
  <p class="stem">${escapeHtml(stem)}${pageRef ? ` <span class="pageref">(p. ${escapeHtml(pageRef)})</span>` : ""}</p>
  <ul class="choices">${choiceItems || "<li><em>No choices listed</em></li>"}</ul>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(heading)}</title>
  <style>
    @page { margin: 0.45in 0.5in; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      color: #222;
      line-height: 1.2;
      font-size: 10.5pt;
      margin: 0;
    }
    .header { text-align: center; margin-bottom: 0.5rem; }
    .logo { display: block; max-height: 44px; max-width: 160px; object-fit: contain; margin: 0 auto 0.35rem; }
    h1 { font-size: 1.15rem; margin: 0 0 0.2rem; line-height: 1.2; }
    h2 { font-size: 0.95rem; margin: 0 0 0.15rem; line-height: 1.2; }
    .meta { color: #555; font-size: 0.78rem; margin: 0; }
    .description { margin: 0.35rem 0 0; font-size: 0.9rem; text-align: center; }
    .banner {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.2rem 1rem;
      margin: 0.85rem 0 0.65rem;
      font-size: 0.9rem;
    }
    .banner label { display: inline-block; min-width: 4.75rem; }
    .questions { margin: 0; }
    .question { margin: 0 0 0.75rem; padding: 0; }
    .stem { margin: 0 0 0.15rem; }
    .pageref { color: #666; font-size: 0.8rem; }
    .choices { list-style: none; margin: 0; padding: 0; }
    .choices li { margin: 0.05rem 0; }
    .choices .letter { font-weight: 700; margin-right: 0.25rem; }
    .choices li.correct { font-weight: 700; }
    .footer { margin-top: 0.5rem; color: #666; font-size: 0.72rem; }
    @media print {
      .no-print { display: none !important; }
      body { font-size: 10pt; }
      .question { break-inside: avoid-page; }
    }
  </style>
</head>
<body>
  <p class="no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
  <header class="header">
    ${logoHtml}
    <h1>${escapeHtml(heading)}</h1>
    <div class="meta">${metaHtml}</div>
  </header>
  ${description ? `<p class="description">${escapeHtml(description)}</p>` : ""}
  ${
    isKey
      ? ""
      : `<div class="banner">
    <div><label>Name:</label> ________________________________</div>
    <div><label>Employee #:</label> ____________________________</div>
    <div><label>Date:</label> ________________________________</div>
    <div><label>Score:</label> ________ / ${input.questions.length}</div>
  </div>`
  }
  <div class="questions">
  ${questionsHtml || "<p><em>No published questions are available for this course.</em></p>"}
  </div>
  <p class="footer">Forge Industrial Safety · ${isKey ? "Instructor answer key - do not distribute to trainees." : "Complete on paper, then return for scoring."}</p>
</body>
</html>`;
}
