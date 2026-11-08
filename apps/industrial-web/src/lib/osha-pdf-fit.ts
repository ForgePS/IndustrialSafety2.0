/**
 * Write text into an OSHA AcroForm field at 12pt or smaller, shrinking until it fits
 * the field's box. The official templates use auto-size fonts, which print oversized
 * text in short boxes and clip long names.
 */

import {
  PDFButton,
  rgb,
  StandardFonts,
  type PDFDocument,
  type PDFFont,
  type PDFForm,
} from "pdf-lib";

export const OSHA_PDF_MAX_FONT = 12;
export const OSHA_PDF_MIN_FONT = 5;
const PADDING = 2;
const LINE_HEIGHT = 1.15;

/** Largest size (≤ max) at which `text` fits a single-line box of the given size. */
export function fitSingleLineFontSize(
  text: string,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  boxWidth: number,
  boxHeight: number,
  max = OSHA_PDF_MAX_FONT,
  min = OSHA_PDF_MIN_FONT,
): number {
  const byHeight = (boxHeight - PADDING) / LINE_HEIGHT;
  const widthAtOne = text ? font.widthOfTextAtSize(text, 1) : 0;
  const byWidth = widthAtOne > 0 ? (boxWidth - PADDING * 2) / widthAtOne : max;
  return clamp(Math.min(max, byHeight, byWidth), min, max);
}

/** Largest size (≤ max) at which `text` word-wraps inside a multi-line box. */
export function fitMultilineFontSize(
  text: string,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  boxWidth: number,
  boxHeight: number,
  max = OSHA_PDF_MAX_FONT,
  min = OSHA_PDF_MIN_FONT,
): number {
  const usable = boxWidth - PADDING * 2;
  for (let size = max; size > min; size -= 0.5) {
    if (wrappedLineCount(text, font, size, usable) * size * LINE_HEIGHT <= boxHeight - PADDING) {
      return size;
    }
  }
  return min;
}

function wrappedLineCount(
  text: string,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  size: number,
  width: number,
): number {
  let lines = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    let current = 0;
    lines += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const w = font.widthOfTextAtSize(`${word} `, size);
      if (current > 0 && current + w > width) {
        lines += 1;
        current = 0;
      }
      current += w;
    }
  }
  return Math.max(lines, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value * 2) / 2));
}

/** Font used to measure and render filled OSHA fields. */
export function embedOshaFont(doc: PDFDocument): Promise<PDFFont> {
  return doc.embedFont(StandardFonts.Helvetica);
}

/** Set a text field's value with a fitted font size; missing fields are skipped. */
export function setFittedText(form: PDFForm, font: PDFFont, name: string, value: string) {
  let field;
  try {
    field = form.getTextField(name);
  } catch {
    return; // Field missing on variant templates — skip.
  }
  field.setText(value);
  const rect = field.acroField.getWidgets()[0]?.getRectangle();
  if (!rect) return;
  const size = field.isMultiline()
    ? fitMultilineFontSize(value, font, rect.width, rect.height)
    : fitSingleLineFontSize(value, font, rect.width, rect.height);
  try {
    field.setFontSize(size);
  } catch {
    // Some official fields (e.g. Form 300 month/day) have no /DA entry; give them one.
    field.acroField.setDefaultAppearance(`/Helv ${size} Tf 0 g`);
  }
}

const formFonts = new WeakMap<PDFForm, PDFFont>();

/** Embed the measuring font for a form so `setOshaText` can fit every field on it. */
export async function prepareOshaForm(doc: PDFDocument): Promise<PDFForm> {
  const form = doc.getForm();
  formFonts.set(form, await embedOshaFont(doc));
  return form;
}

/** `setFittedText` using the font registered by `prepareOshaForm`. */
export function setOshaText(form: PDFForm, name: string, value: string) {
  const font = formFonts.get(form);
  if (font) {
    setFittedText(form, font, name, value);
    return;
  }
  try {
    form.getTextField(name).setText(value);
  } catch {
    // Field missing on variant templates — skip.
  }
}

/** Redraw fields with the fitted sizes, then flatten onto the official artwork. */
export function flattenOshaForm(form: PDFForm) {
  // The fillable templates' Reset / Add Page buttons are also drawn in the page artwork,
  // so paint over each button's box before removing the field, or it prints on the form.
  const pages = form.doc.getPages();
  for (const field of form.getFields()) {
    if (!(field instanceof PDFButton)) continue;
    for (const widget of field.acroField.getWidgets()) {
      const rect = widget.getRectangle();
      const pageRef = widget.P();
      const page = pages.find((p) => p.ref === pageRef) ?? pages[0];
      page?.drawRectangle({
        x: rect.x - 1,
        y: rect.y - 1,
        width: rect.width + 2,
        height: rect.height + 2,
        color: rgb(1, 1, 1),
      });
    }
    form.removeField(field);
  }
  const font = formFonts.get(form);
  if (font) form.updateFieldAppearances(font);
  form.flatten();
}
