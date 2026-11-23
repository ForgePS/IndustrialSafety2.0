/** Port slice 18: date and time display for permits, always in the company time zone with its abbreviation. */

export const formatWhen = (value: string | Date | null | undefined, timeZone: string) => {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value

  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

export const formatDate = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(value.length === 10 ? value + 'T12:00:00Z' : value)

  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
}

/** "2 h 15 min left", "Expired 40 min ago". */
export const timeLeftLabel = (minutes: number | null) => {
  if (minutes === null) return ''

  const span = (value: number) => {
    const hours = Math.floor(value / 60)
    const mins = value % 60

    if (hours >= 48) return `${Math.floor(hours / 24)} days`

    return hours ? `${hours} h${mins ? ` ${mins} min` : ''}` : `${mins} min`
  }

  return minutes <= 0 ? `Expired ${span(Math.abs(minutes))} ago` : `${span(minutes)} left`
}
