/**
 * Workers' comp weekly status email (1.0 workers_comp.weekly_status). Pure functions with no imports so
 * they can be unit tested directly with `node --experimental-strip-types`.
 *
 * The preview page uses these today. When the shared notification/email service lands, its sweep uses
 * weeklyEmailDue() to decide when to send and buildWeeklyStatusEmail() for the content.
 */

export const WC_WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DAY_MS = 86_400_000

const utcDay = (iso: string) => new Date(Date.parse(iso + 'T00:00:00Z')).getUTCDay()
const addDays = (iso: string, days: number) => new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10)

/** Splits a pasted list (commas, semicolons, spaces or new lines) into unique, lowercase addresses. */
export const parseEmailRecipients = (raw: string) => {
  const valid: string[] = []
  const invalid: string[] = []

  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase()

    if (!email) continue
    if (!EMAIL_PATTERN.test(email)) invalid.push(email)
    else if (!valid.includes(email)) valid.push(email)
  }

  return { valid, invalid }
}

/** The most recent Thursday on or before the date: the week a report sent that day covers. */
export const reportWeekOf = (iso: string) => addDays(iso, -((utcDay(iso) - 4 + 7) % 7))

/**
 * Whether the weekly email should go out now. `local` is the current date, weekday (0 = Sunday) and hour
 * in the tenant's time zone. Never repeats a week that was already sent.
 */
export const weeklyEmailDue = (
  settings: { enabled: boolean; weekday: number; hour: number; lastSentWeek: string | null },
  local: { date: string; weekday: number; hour: number }
) => {
  const weekOf = reportWeekOf(local.date)
  const due = settings.enabled && local.weekday === settings.weekday && local.hour >= settings.hour && settings.lastSentWeek !== weekOf

  return { due, weekOf }
}

export type WcWeeklyEmailRow = {
  caseNumber: string
  employeeName: string
  injuryDate: string
  location: string
  stage: string
  workStatus: string
  daysAway: number
  restrictedDays: number
  claim: string
  carrier: string
  note: string | null
  link: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Subject, HTML and plain-text bodies for the weekly open-case status email. */
export const buildWeeklyStatusEmail = ({
  organizationName,
  weekOf,
  rows
}: {
  organizationName: string
  weekOf: string
  rows: WcWeeklyEmailRow[]
}) => {
  const missing = rows.filter(row => !row.note).length
  const subject = `Workers' comp weekly status: ${plural(rows.length, 'open case')} (week of ${weekOf})`

  const textRows = rows.map(row =>
    [
      `${row.caseNumber} - ${row.employeeName}`,
      `  Injured ${row.injuryDate} at ${row.location || 'unknown location'} | ${row.stage} | ${row.workStatus}`,
      `  ${row.daysAway} days away, ${row.restrictedDays} restricted | Claim: ${row.claim}${row.carrier ? ` (${row.carrier})` : ''}`,
      `  This week: ${row.note || 'NO UPDATE ENTERED'}`,
      `  ${row.link}`
    ].join('\n')
  )

  const text = [
    `${organizationName}: workers' comp weekly status for the week of ${weekOf}.`,
    `${plural(rows.length, 'open case')}; ${missing} without this week's update.`,
    ...(textRows.length ? textRows : ['No open cases.'])
  ].join('\n\n')

  const cell = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:13px;'

  const htmlRows = rows
    .map(row =>
      [
        '<tr>',
        `<td style="${cell}"><a href="${escapeHtml(row.link)}">${escapeHtml(row.caseNumber)}</a><br>${escapeHtml(row.employeeName)}</td>`,
        `<td style="${cell}">${escapeHtml(row.injuryDate)}<br>${escapeHtml(row.location)}</td>`,
        `<td style="${cell}">${escapeHtml(row.stage)}<br>${escapeHtml(row.workStatus)}</td>`,
        `<td style="${cell}">${row.daysAway} / ${row.restrictedDays}</td>`,
        `<td style="${cell}">${escapeHtml(row.claim)}${row.carrier ? `<br>${escapeHtml(row.carrier)}` : ''}</td>`,
        `<td style="${cell}">${row.note ? escapeHtml(row.note).replace(/\n/g, '<br>') : '<strong style="color:#b91c1c">No update entered</strong>'}</td>`,
        '</tr>'
      ].join('')
    )
    .join('\n')

  const header = ['Case', 'Injury', 'Stage / status', 'Days away / restricted', 'Claim', 'This week']
    .map(label => `<th align="left" style="${cell}">${label}</th>`)
    .join('')

  const html = [
    '<div style="font-family:Arial,sans-serif;color:#111827">',
    '<h2 style="margin:0 0 4px">Workers&#39; comp weekly status</h2>',
    `<p style="margin:0 0 12px">${escapeHtml(organizationName)} · week of ${escapeHtml(weekOf)} · ${plural(rows.length, 'open case')}, ${missing} without this week&#39;s update.</p>`,
    '<table style="border-collapse:collapse;width:100%">',
    `<thead><tr>${header}</tr></thead>`,
    `<tbody>${htmlRows || `<tr><td colspan="6" style="${cell}">No open cases.</td></tr>`}</tbody>`,
    '</table>',
    '<p style="font-size:12px;color:#6b7280;margin-top:12px">Contains confidential claim information. Do not forward.</p>',
    '</div>'
  ].join('\n')

  return { subject, html, text }
}
