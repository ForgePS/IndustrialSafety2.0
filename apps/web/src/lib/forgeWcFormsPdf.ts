import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * Draws a filled workers' comp form onto the tenant's original PDF, so the printout matches the paper form.
 * Takes the layout from forgeWcFormsRules.layoutFor(); positions are page fractions from the top-left.
 */

type Position =
  | { kind: 'text'; key: string; x: number; y: number; size: number; maxWidth: number }
  | { kind: 'label'; text: string; x: number; y: number; size: number; bold?: boolean }
  | { kind: 'signature'; x: number; top: number; width: number; height: number }

const INK = rgb(0.06, 0.12, 0.38)
const LABEL = rgb(0.1, 0.1, 0.1)
const MIN_SIZE = 6

// The standard PDF fonts only cover WinAnsi; anything else would throw, so it is replaced.
const printable = (value: string) => value.replace(/[^\x20-\x7E -ÿ]/g, '?')

/** Checks an uploaded template: a readable, unencrypted PDF of one to four pages. Returns its page count. */
export const inspectWcFormTemplate = async (bytes: Uint8Array) => {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const pages = document.getPageCount()

  if (pages < 1 || pages > 4) throw new Error('The form must be a PDF of one to four pages.')

  return { pages }
}

export const renderFilledWcForm = async ({
  templateBytes,
  layout,
  values,
  signaturePng
}: {
  templateBytes: Uint8Array
  layout: Position[]
  values: Record<string, string>
  signaturePng: Uint8Array | null
}) => {
  const document = await PDFDocument.load(templateBytes, { updateMetadata: false })
  const page = document.getPage(0)
  const { width, height } = page.getSize()
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)

  for (const position of layout) {
    if (position.kind === 'signature') {
      if (!signaturePng) continue

      const image = await document.embedPng(signaturePng)
      const boxWidth = position.width * width
      const boxHeight = position.height * height
      const scale = Math.min(boxWidth / image.width, boxHeight / image.height)
      const drawWidth = image.width * scale
      const drawHeight = image.height * scale

      // Bottom-aligned in the box, so the signature sits on the line like ink would.
      page.drawImage(image, { x: position.x * width, y: height - (position.top + position.height) * height, width: drawWidth, height: drawHeight })
      continue
    }

    const text = printable(position.kind === 'label' ? position.text : values[position.key] || '')

    if (!text) continue

    const font = position.kind === 'label' && position.bold ? bold : regular
    const limit = position.kind === 'text' ? position.maxWidth * width : Infinity
    let size = position.size

    while (size > MIN_SIZE && font.widthOfTextAtSize(text, size) > limit) size -= 0.5

    page.drawText(text, {
      x: position.x * width,
      y: height - position.y * height,
      size,
      font,
      color: position.kind === 'label' ? LABEL : INK,
      maxWidth: position.kind === 'text' ? limit : undefined
    })
  }

  document.setTitle(document.getTitle() || 'Workers\' comp form')

  return document.save()
}
