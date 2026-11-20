import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import { formatCell, type ReportResult } from '@/lib/forgeReportRules'

/**
 * Port slice 13: a report as a PDF table. Landscape letter, the header repeated on every page, page numbers,
 * and column widths fitted to the content. 1.0 used fixed-width columns and stopped after 200 rows; this prints
 * every row up to MAX_PDF_ROWS and says so if it had to stop.
 */

export const MAX_PDF_ROWS = 5000

// The standard PDF fonts only cover WinAnsi; anything else would throw, so it is replaced.
const printable = (value: string) => value.replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E -ÿ]/g, '?')

const PAGE = { width: 792, height: 612 }
const MARGIN = 36
const FONT_SIZE = 8
const HEADER_SIZE = 8
const ROW_HEIGHT = 14
const CELL_PAD = 3

const fit = (text: string, font: PDFFont, size: number, width: number) => {
  const clean = printable(text)

  if (font.widthOfTextAtSize(clean, size) <= width) return clean

  let low = 0
  let high = clean.length

  while (low < high) {
    const mid = Math.ceil((low + high) / 2)

    if (font.widthOfTextAtSize(clean.slice(0, mid) + '...', size) <= width) low = mid
    else high = mid - 1
  }

  return clean.slice(0, low) + '...'
}

export const reportPdf = async ({
  title,
  subtitle,
  result,
  generatedFor
}: {
  title: string
  subtitle: string
  result: ReportResult
  generatedFor: string
}) => {
  const document = await PDFDocument.create()
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)

  document.setTitle(printable(title))
  document.setCreator('Forge Industrial Safety')

  const numericKeys = result.groupBy ? Object.keys(result.groups[0]?.totals || {}) : []
  const labels = new Map(result.columns.map(column => [column.key, column.label]))

  const headers = result.groupBy
    ? [result.groupBy.label, 'Count', ...numericKeys.map(key => 'Total ' + (labels.get(key) || key).toLowerCase())]
    : result.columns.map(column => column.label)

  const allRows: string[][] = result.groupBy
    ? result.groups.map(group => [group.label, String(group.count), ...numericKeys.map(key => String(group.totals[key]))])
    : result.rows.map(row => result.columns.map(column => formatCell(row[column.key] ?? null, column.type)))

  const rows = allRows.slice(0, MAX_PDF_ROWS)
  const usable = PAGE.width - MARGIN * 2

  // Width per column from its longest text (header included), capped, then scaled to the page.
  const natural = headers.map((header, index) => {
    const longest = Math.max(
      bold.widthOfTextAtSize(printable(header), HEADER_SIZE),
      ...rows.slice(0, 300).map(row => regular.widthOfTextAtSize(printable(row[index] || ''), FONT_SIZE))
    )

    return Math.min(Math.max(longest + CELL_PAD * 2, 40), 220)
  })

  const total = natural.reduce((sum, width) => sum + width, 0)
  const widths = natural.map(width => (width / total) * usable)

  let page: PDFPage | null = null
  let y = 0
  const pages: PDFPage[] = []

  const drawHeader = () => {
    page = document.addPage([PAGE.width, PAGE.height])
    pages.push(page)
    y = PAGE.height - MARGIN

    if (pages.length === 1) {
      page.drawText(fit(title, bold, 14, usable), { x: MARGIN, y: y - 14, size: 14, font: bold })
      y -= 22
      page.drawText(fit(subtitle, regular, 9, usable), { x: MARGIN, y: y - 9, size: 9, font: regular, color: rgb(0.35, 0.35, 0.35) })
      y -= 14
      page.drawText(fit(generatedFor, regular, 8, usable), { x: MARGIN, y: y - 8, size: 8, font: regular, color: rgb(0.45, 0.45, 0.45) })
      y -= 16
    }

    page.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT, width: usable, height: ROW_HEIGHT, color: rgb(0.92, 0.92, 0.94) })

    let x = MARGIN

    headers.forEach((header, index) => {
      page!.drawText(fit(header, bold, HEADER_SIZE, widths[index] - CELL_PAD * 2), { x: x + CELL_PAD, y: y - ROW_HEIGHT + 4, size: HEADER_SIZE, font: bold })
      x += widths[index]
    })

    y -= ROW_HEIGHT
  }

  drawHeader()

  if (!rows.length) {
    page!.drawText('No records match these filters.', { x: MARGIN, y: y - 16, size: 9, font: regular, color: rgb(0.35, 0.35, 0.35) })
  }

  rows.forEach((row, rowIndex) => {
    if (y - ROW_HEIGHT < MARGIN + 14) drawHeader()

    if (rowIndex % 2 === 1) page!.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT, width: usable, height: ROW_HEIGHT, color: rgb(0.975, 0.975, 0.98) })

    let x = MARGIN

    row.forEach((cell, index) => {
      if (cell) page!.drawText(fit(cell, regular, FONT_SIZE, widths[index] - CELL_PAD * 2), { x: x + CELL_PAD, y: y - ROW_HEIGHT + 4, size: FONT_SIZE, font: regular })
      x += widths[index]
    })

    y -= ROW_HEIGHT
  })

  if (allRows.length > rows.length) {
    if (y - 20 < MARGIN) drawHeader()
    page!.drawText(`Showing the first ${MAX_PDF_ROWS} of ${allRows.length} rows. Download the CSV for all of them.`, {
      x: MARGIN,
      y: y - 16,
      size: 8,
      font: bold
    })
  }

  pages.forEach((each, index) => {
    const label = `Page ${index + 1} of ${pages.length}`

    each.drawText(label, { x: PAGE.width - MARGIN - regular.widthOfTextAtSize(label, 7), y: MARGIN - 18, size: 7, font: regular, color: rgb(0.45, 0.45, 0.45) })
  })

  return document.save()
}
