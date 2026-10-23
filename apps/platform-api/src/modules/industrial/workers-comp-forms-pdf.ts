/**
 * Producers Rice Mill workers' compensation paper forms.
 *
 * The original one-page PDFs (flat scans, US Letter 612x792pt, no AcroForm fields) live in
 * assets/forms/producers. "Blank" output is the original file byte-for-byte. "Filled" output
 * draws the saved answers and signature onto that same page at fixed coordinates, so a printed
 * copy looks like the paper form filled in by hand.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BlendMode, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const WC_FORM_KEYS = ["INJURY_GUIDELINES_ACK", "HIPAA_AUTHORIZATION"] as const;
export type WcFormKey = (typeof WC_FORM_KEYS)[number];

export const WC_FORM_META: Record<WcFormKey, { title: string; templateFile: string; fileStem: string; medical: boolean }> = {
  INJURY_GUIDELINES_ACK: {
    title: "Employee Injury Guidelines",
    templateFile: "employee-injury-guidelines.pdf",
    fileStem: "employee-injury-guidelines",
    medical: false,
  },
  HIPAA_AUTHORIZATION: {
    title: "HIPAA Authorization Form",
    templateFile: "hipaa-authorization.pdf",
    fileStem: "hipaa-authorization",
    medical: true,
  },
};

export type HipaaInitialKey = "releaseRecords" | "sensitiveInformation" | "postalOrFax" | "unencryptedEmail";
export const HIPAA_INITIAL_KEYS: readonly HipaaInitialKey[] = [
  "releaseRecords",
  "sensitiveInformation",
  "postalOrFax",
  "unencryptedEmail",
];

export type InjuryGuidelinesAckData = {
  employeeName: string;
  signedDate: string; // YYYY-MM-DD
};

export type HipaaAuthorizationData = {
  patientName: string;
  dateOfBirth: string; // YYYY-MM-DD
  providerName: string;
  initials: Record<HipaaInitialKey, string>;
  signerName: string;
  signerRelationship: string;
  signedDate: string; // YYYY-MM-DD
};

export type WcFormPdfInput =
  | { formKey: "INJURY_GUIDELINES_ACK"; data: InjuryGuidelinesAckData; signatureDataUrl: string; formId: string; signedAt: Date }
  | { formKey: "HIPAA_AUTHORIZATION"; data: HipaaAuthorizationData; signatureDataUrl: string; formId: string; signedAt: Date };

const templateCache = new Map<WcFormKey, Uint8Array>();

/** Original template bytes (cached). Throws if the asset is missing from the deployment. */
export function loadWcFormTemplate(formKey: WcFormKey): Uint8Array {
  const cached = templateCache.get(formKey);
  if (cached) return cached;
  const file = WC_FORM_META[formKey].templateFile;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "../../../assets/forms/producers", file),
    path.join(process.cwd(), "assets/forms/producers", file),
    path.join(process.cwd(), "apps/platform-api/assets/forms/producers", file),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const bytes = new Uint8Array(readFileSync(candidate));
    templateCache.set(formKey, bytes);
    return bytes;
  }
  throw new Error(`Workers' comp form template missing: ${file}`);
}

/** MM/DD/YYYY for an ISO date (YYYY-MM-DD); returns the input unchanged if it is not one. */
export function formatFormDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value.trim();
}

const INK = rgb(0.05, 0.12, 0.42); // dark blue, reads as pen on a printed form
const MUTED = rgb(0.4, 0.4, 0.4);

/** Draw text left-aligned at (x, y), shrinking the font so it fits within maxWidth. */
function drawFitted(page: PDFPage, font: PDFFont, text: string, x: number, y: number, maxWidth: number, size = 11) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return;
  let fontSize = size;
  while (fontSize > 6 && font.widthOfTextAtSize(value, fontSize) > maxWidth) fontSize -= 0.5;
  let output = value;
  while (output.length > 1 && font.widthOfTextAtSize(output, fontSize) > maxWidth) output = output.slice(0, -1);
  page.drawText(output, { x, y, size: fontSize, font, color: INK });
}

/** Draw text centered on cx. */
function drawCentered(page: PDFPage, font: PDFFont, text: string, cx: number, y: number, maxWidth: number, size = 11) {
  const value = text.trim();
  if (!value) return;
  let fontSize = size;
  while (fontSize > 6 && font.widthOfTextAtSize(value, fontSize) > maxWidth) fontSize -= 0.5;
  page.drawText(value, { x: cx - font.widthOfTextAtSize(value, fontSize) / 2, y, size: fontSize, font, color: INK });
}

async function embedSignature(doc: PDFDocument, dataUrl: string) {
  const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) throw new Error("Signature must be a PNG or JPEG data URL");
  const bytes = Buffer.from(match[2]!, "base64");
  return match[1] === "png" ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}

/**
 * Fit the signature image inside a box anchored at its bottom-left corner. Multiply blending makes
 * the white background of a JPEG signature see-through, so nearby printed text stays readable.
 */
function drawSignature(
  page: PDFPage,
  image: Awaited<ReturnType<typeof embedSignature>>,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  page.drawImage(image, { x, y, width: image.width * scale, height: image.height * scale, blendMode: BlendMode.Multiply });
}

function drawElectronicFooter(page: PDFPage, font: PDFFont, formId: string, signedAt: Date) {
  const stamp = `Signed electronically in Forge Industrial Safety on ${signedAt.toISOString().slice(0, 16).replace("T", " ")} UTC. Form ID ${formId}`;
  page.drawText(stamp, { x: 36, y: 22, size: 7, font, color: MUTED });
}

// Coordinates are PDF points from the bottom-left of the 612x792 page, measured against the scans.
const HIPAA_LAYOUT = {
  name: { x: 128, y: 657, width: 196 },
  dateOfBirth: { x: 398, y: 657, width: 128 },
  provider: { x: 140, y: 614, width: 170 },
  initials: {
    releaseRecords: { cx: 105, y: 580 },
    sensitiveInformation: { cx: 105, y: 528 },
    postalOrFax: { cx: 105, y: 496 },
    unencryptedEmail: { cx: 105, y: 476 },
  } satisfies Record<HipaaInitialKey, { cx: number; y: number }>,
  signature: { x: 92, y: 234, width: 300, height: 34 },
  printedName: { x: 92, y: 192, width: 355 },
  date: { x: 92, y: 151, width: 200 },
};

// The guidelines sheet has no fields; the acknowledgment goes in the blank space under the table.
const GUIDELINES_ACK_LAYOUT = {
  top: 238,
  left: 92,
  right: 538,
};

/** The original paper form, unchanged. */
export function buildBlankWcFormPdf(formKey: WcFormKey): Buffer {
  return Buffer.from(loadWcFormTemplate(formKey));
}

/** The original form with the saved answers and signature drawn on it. */
export async function buildFilledWcFormPdf(input: WcFormPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.load(loadWcFormTemplate(input.formKey));
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const signature = await embedSignature(doc, input.signatureDataUrl);

  doc.setTitle(`${WC_FORM_META[input.formKey].title} (signed)`);
  doc.setProducer("Forge Industrial Safety");
  doc.setCreationDate(input.signedAt);

  if (input.formKey === "HIPAA_AUTHORIZATION") {
    const d = input.data;
    const L = HIPAA_LAYOUT;

    drawFitted(page, font, d.patientName, L.name.x, L.name.y, L.name.width);
    drawFitted(page, font, formatFormDate(d.dateOfBirth), L.dateOfBirth.x, L.dateOfBirth.y, L.dateOfBirth.width);
    drawFitted(page, font, d.providerName, L.provider.x, L.provider.y, L.provider.width);
    for (const key of HIPAA_INITIAL_KEYS) {
      const spot = L.initials[key];
      drawCentered(page, font, d.initials[key] ?? "", spot.cx, spot.y, 26);
    }
    drawSignature(page, signature, L.signature.x, L.signature.y, L.signature.width, L.signature.height);
    const printed = [d.signerName, d.signerRelationship].map(v => v.trim()).filter(Boolean).join(", ");
    drawFitted(page, font, printed, L.printedName.x, L.printedName.y, L.printedName.width);
    drawFitted(page, font, formatFormDate(d.signedDate), L.date.x, L.date.y, L.date.width);
  } else {
    const d = input.data;
    const L = GUIDELINES_ACK_LAYOUT;
    const ink = rgb(0, 0, 0);
    const line = (y: number, x1: number, x2: number) =>
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.75, color: ink });

    page.drawText("Employee Acknowledgment", { x: L.left, y: L.top, size: 12, font: bold, color: ink });
    page.drawText("I received a copy of the Employee Injury Guidelines and will follow them.", {
      x: L.left,
      y: L.top - 18,
      size: 10,
      font,
      color: ink,
    });

    const nameY = L.top - 52;
    page.drawText("Employee name:", { x: L.left, y: nameY, size: 10, font, color: ink });
    line(nameY - 2, L.left + 80, L.right);
    drawFitted(page, font, d.employeeName, L.left + 84, nameY + 1, L.right - L.left - 90);

    const sigY = L.top - 100;
    page.drawText("Signature:", { x: L.left, y: sigY, size: 10, font, color: ink });
    line(sigY - 2, L.left + 80, L.left + 330);
    drawSignature(page, signature, L.left + 84, sigY - 1, 240, 34);

    page.drawText("Date:", { x: L.left + 345, y: sigY, size: 10, font, color: ink });
    line(sigY - 2, L.left + 375, L.right);
    drawFitted(page, font, formatFormDate(d.signedDate), L.left + 379, sigY + 1, L.right - L.left - 385);
  }

  drawElectronicFooter(page, font, input.formId, input.signedAt);
  return Buffer.from(await doc.save());
}

export function wcFormPdfFilename(formKey: WcFormKey, caseNumber: string | null, filled: boolean): string {
  const stem = WC_FORM_META[formKey].fileStem;
  const suffix = (caseNumber ?? "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return [stem, suffix || null, filled ? "signed" : "blank"].filter(Boolean).join("-") + ".pdf";
}
