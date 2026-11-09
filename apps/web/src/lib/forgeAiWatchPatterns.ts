// Pure pattern detectors for Forge AI Watch. Each returns the records behind a finding so the
// alert can cite them and so access checks can require the viewer to see every one.

const DAY = 86_400_000

export type PatternIncident = {
  id: string
  incident_number: string
  incident_type: string | null
  occurred_at: string
  location_id: string | null
  division_id?: string | null
}

export type IncidentCluster = {
  locationId: string
  divisionId: string | null
  incidentType: string
  incidents: PatternIncident[]
}

// The same incident type at one location, min_count or more times within the window.
export const detectRecurringIncidents = (
  incidents: PatternIncident[],
  { windowDays, minCount }: { windowDays: number; minCount: number },
  now: Date
): IncidentCluster[] => {
  const since = now.getTime() - windowDays * DAY
  const groups = new Map<string, PatternIncident[]>()

  for (const incident of incidents) {
    if (!incident.location_id || !incident.incident_type) continue
    if (new Date(incident.occurred_at).getTime() < since) continue

    const key = incident.location_id + '|' + incident.incident_type
    const group = groups.get(key) || []

    group.push(incident)
    groups.set(key, group)
  }

  return [...groups.values()]
    .filter(group => group.length >= minCount)
    .map(group => ({
      locationId: group[0].location_id as string,
      divisionId: group[0].division_id ?? null,
      incidentType: group[0].incident_type as string,
      incidents: [...group].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    }))
    .sort((a, b) => b.incidents.length - a.incidents.length)
}

export type IncidentTrend = {
  locationId: string
  divisionId: string | null
  recent: PatternIncident[]
  baselineCount: number

  // Baseline incidents per window, from the prior baseline_days.
  baselineRate: number
  ratio: number
}

// A location's incidents in the last window_days against its own rate over the baseline_days
// before that. Flags when the recent count is at least min_count and at least ratio x baseline.
// A location with no baseline history is not flagged: there is nothing to compare against.
export const detectIncidentTrends = (
  incidents: PatternIncident[],
  { windowDays, baselineDays, minCount, ratio }: { windowDays: number; baselineDays: number; minCount: number; ratio: number },
  now: Date
): IncidentTrend[] => {
  const recentStart = now.getTime() - windowDays * DAY
  const baselineStart = recentStart - baselineDays * DAY
  const byLocation = new Map<string, { recent: PatternIncident[]; baseline: number; divisionId: string | null }>()

  for (const incident of incidents) {
    if (!incident.location_id) continue

    const at = new Date(incident.occurred_at).getTime()

    if (at < baselineStart) continue

    const entry = byLocation.get(incident.location_id) || { recent: [], baseline: 0, divisionId: incident.division_id ?? null }

    if (at >= recentStart) entry.recent.push(incident)
    else entry.baseline += 1
    byLocation.set(incident.location_id, entry)
  }

  const trends: IncidentTrend[] = []

  for (const [locationId, entry] of byLocation) {
    if (entry.baseline === 0) continue

    const baselineRate = (entry.baseline / baselineDays) * windowDays
    const observed = entry.recent.length / baselineRate

    if (entry.recent.length >= minCount && observed >= ratio) {
      trends.push({
        locationId,
        divisionId: entry.divisionId,
        recent: entry.recent,
        baselineCount: entry.baseline,
        baselineRate: Math.round(baselineRate * 100) / 100,
        ratio: Math.round(observed * 100) / 100
      })
    }
  }

  return trends.sort((a, b) => b.ratio - a.ratio)
}

export type PatternAssignment = { id: string; due_date: string | null; location_id: string | null; division_id?: string | null }

export type TrainingGap = { locationId: string; divisionId: string | null; total: number; overdue: PatternAssignment[]; share: number }

// Locations where at least min_share of open training assignments are overdue (and at least min_overdue).
export const detectTrainingGaps = (
  assignments: PatternAssignment[],
  { minShare, minOverdue }: { minShare: number; minOverdue: number },
  now: Date
): TrainingGap[] => {
  const today = now.toISOString().slice(0, 10)
  const byLocation = new Map<string, { total: number; overdue: PatternAssignment[]; divisionId: string | null }>()

  for (const assignment of assignments) {
    if (!assignment.location_id) continue

    const entry = byLocation.get(assignment.location_id) || { total: 0, overdue: [], divisionId: assignment.division_id ?? null }

    entry.total += 1
    if (assignment.due_date && assignment.due_date < today) entry.overdue.push(assignment)
    byLocation.set(assignment.location_id, entry)
  }

  return [...byLocation.entries()]
    .map(([locationId, entry]) => ({
      locationId,
      divisionId: entry.divisionId,
      total: entry.total,
      overdue: entry.overdue,
      share: Math.round((entry.overdue.length / entry.total) * 1000) / 1000
    }))
    .filter(gap => gap.overdue.length >= minOverdue && gap.share >= minShare)
    .sort((a, b) => b.share - a.share)
}

const SEVERITY_RANK: Record<string, number> = { info: 0, warning: 1, high: 2, critical: 3 }

export const severityAtLeast = (severity: string, minimum: string) => (SEVERITY_RANK[severity] ?? 0) >= (SEVERITY_RANK[minimum] ?? 0)
