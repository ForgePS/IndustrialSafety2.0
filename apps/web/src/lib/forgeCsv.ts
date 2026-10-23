import { NextResponse } from 'next/server'

/** Quotes every cell and neutralizes spreadsheet formulas (cells starting with = + - @ tab or CR). */
export const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text

  return `"${safe.replace(/"/g, '""')}"`
}

export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map(line => line.map(csvCell).join(',')).join('\r\n')

export const csvResponse = (fileName: string, header: string[], rows: unknown[][]) =>
  new NextResponse(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, '-')}"`,
      'Cache-Control': 'no-store'
    }
  })
