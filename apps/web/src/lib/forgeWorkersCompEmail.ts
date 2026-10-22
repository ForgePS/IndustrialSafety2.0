/**
 * Workers' comp weekly status notice (1.0 workers_comp.weekly_status). Pure functions with no imports so
 * they can be unit tested directly with `node --experimental-strip-types`.
 *
 * The hourly sweep (forgeWorkersCompNotify.ts) uses weeklyEmailDue() to decide when to send and
 * buildWeeklyStatusNotice() for the content. The notice is delivered through the shared notification service
 * (in-app inbox plus email), so it follows that service's limits: a 200-character title and a 2,000-character
 * plain-text body. It carries case numbers and status only. Employee names and injury details stay behind login.
 */

export const WC_WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export const WC_WEEKLY_NOTICE_LINK = '/workers-comp/weekly'

const DAY_MS = 86_400_000
const TITLE_MAX = 200
const BODY_MAX = 2000

// Room kept for the "... and N more" line when cases are cut.
const MORE_RESERVE = 40

const utcDay = (iso: string) => new Date(Date.parse(iso + 'T00:00:00Z')).getUTCDay()
const addDays = (iso: string, days: number) => new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10)

/** Day of the week (0 = Sunday) for a YYYY-MM-DD date. */
export const weekdayOf = (iso: string) => utcDay(iso)

/** The most recent Thursday on or before the date: the week a report sent that day covers. */
export const reportWeekOf = (iso: string) => addDays(iso, -((utcDay(iso) - 4 + 7) % 7))

/**
 * Whether the weekly notice should go out now. `local` is the current date, weekday (0 = Sunday) and hour
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

export type WcWeeklyNoticeRow = {
  caseNumber: string
  stage: string
  workStatus: string
  daysAway: number
  restrictedDays: number
  hasUpdate: boolean
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Title and plain-text body for one recipient's weekly status notice, sized for the notification service. */
export const buildWeeklyStatusNotice = ({
  organizationName,
  weekOf,
  rows
}: {
  organizationName: string
  weekOf: string
  rows: WcWeeklyNoticeRow[]
}) => {
  const missing = rows.filter(row => !row.hasUpdate)
  const title = `Workers' comp weekly status: ${plural(rows.length, 'open case')} (week of ${weekOf})`.slice(0, TITLE_MAX)

  const intro = [
    `${organizationName}: workers' comp status for the week of ${weekOf}.`,
    rows.length ? `${plural(rows.length, 'open case')}; ${missing.length} without this week's update.` : 'No open cases in your area.'
  ].join('\n')

  const footer = 'Open the weekly status page in Forge for employee details. Contains confidential claim information.'

  // Cases missing an update come first, since they need action.
  const ordered = [...missing, ...rows.filter(row => row.hasUpdate)]
  const budget = BODY_MAX - intro.length - footer.length - 4 - MORE_RESERVE
  const lines: string[] = []
  let used = 0

  for (const [index, row] of ordered.entries()) {
    const line = `- ${row.caseNumber}: ${row.stage}, ${row.workStatus}, ${row.daysAway} away / ${row.restrictedDays} restricted${row.hasUpdate ? '' : ' - NO UPDATE'}`

    if (used + line.length + 1 > budget) {
      lines.push(`... and ${ordered.length - index} more`)
      break
    }

    lines.push(line)
    used += line.length + 1
  }

  const body = [intro, lines.join('\n'), footer].filter(Boolean).join('\n\n')

  return { title, body }
}
