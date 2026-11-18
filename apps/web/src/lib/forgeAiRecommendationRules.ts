// Forge AI recommendation rules. Pure and deterministic: a recommendation is produced only from
// a condition that already exists in Forge (an open Watch alert, or a risk indicator factor
// that is driving an Elevated or High score), and it cites the records behind that condition.
// Nothing here predicts outcomes; verification later checks the same facts again.

export type RecommendationKind = 'corrective_action' | 'review' | 'training' | 'maintenance' | 'escalation'
export type RecommendationPriority = 'low' | 'medium' | 'high' | 'critical'

export type RecommendationEvidence = { type: string; id: string; reference: string | null }

export type VerificationCriterion =
  | { type: 'alert_cleared'; alert_id: string }
  | { type: 'action_completed' }
  | { type: 'factor_reduced'; scope_type: 'location' | 'division'; scope_id: string; factor_key: string; baseline: number }

export type ProposedAction = { action_key: 'corrective_action.create'; payload: Record<string, unknown> }

export type RecommendationCandidate = {
  recommendation_key: string
  kind: RecommendationKind
  title: string
  rationale: string
  priority: RecommendationPriority
  source_type: 'watch_alert' | 'risk_assessment'
  watch_alert_id: string | null
  risk_assessment_id: string | null
  rule_key: string | null
  factor_key: string | null
  scope_type: 'location' | 'division' | null
  scope_id: string | null
  location_id: string | null
  division_id: string | null
  evidence: RecommendationEvidence[]
  proposed_action: ProposedAction | null
  verification_criteria: VerificationCriterion[]
}

export type AlertInput = {
  id: string
  rule_key: string
  severity: string
  status: string
  target_type: string
  target_id: string
  target_reference: string | null
  title: string
  summary: string
  location_id: string | null
  division_id: string | null
  data: Record<string, any> | null
}

export type IndicatorInput = {
  factor_key: string
  label: string
  available: boolean
  raw_value: number | null
  normalized: number | null
  contribution: number | null
  detail: string
  evidence: RecommendationEvidence[]
}

export type AssessmentInput = {
  id: string
  scope_type: 'location' | 'division'
  scope_id: string
  scope_name: string
  score: number | null
  band: string
  indicators: IndicatorInput[]
}

export const RECOMMENDATION_EVIDENCE_LIMIT = 25

// A factor must be at least this far toward saturation to be worth a recommendation.
export const FACTOR_MIN_NORMALIZED = 0.5
export const FACTORS_PER_ASSESSMENT = 3
export const RECOMMENDATION_BANDS = ['elevated', 'high']

export const LIVE_RECOMMENDATION_STATUSES = ['proposed', 'in_review', 'approved', 'executing', 'executed']

const PRIORITY_FOR_SEVERITY: Record<string, RecommendationPriority> = {
  critical: 'critical',
  high: 'high',
  warning: 'medium',
  info: 'low'
}

const CAPA_SEVERITY_FOR_PRIORITY: Record<RecommendationPriority, string> = {
  critical: 'critical',
  high: 'high',
  medium: 'moderate',
  low: 'low'
}

const CAPA_SOURCE_FOR_TARGET: Record<string, string> = {
  incident: 'incident',
  incident_pattern: 'incident',
  incident_trend: 'incident',
  inspection: 'inspection',
  inspection_finding: 'inspection',
  observation: 'observation',
  risk: 'risk',
  asset: 'asset',
  loto_procedure: 'loto',
  training_gap: 'training'
}

const clip = (value: string, length: number) => (value.length > length ? value.slice(0, length - 1).trimEnd() + '…' : value)

const alertReference = (alert: AlertInput) => {
  const data = alert.data || {}

  return (
    alert.target_reference ||
    data.incident_number ||
    data.inspection_number ||
    data.observation_number ||
    data.risk_number ||
    data.asset_number ||
    data.asset_name ||
    data.title ||
    null
  )
}

const alertEvidence = (alert: AlertInput): RecommendationEvidence[] => {
  const data = alert.data || {}
  const evidence: RecommendationEvidence[] = [{ type: 'watch_alert', id: alert.id, reference: alert.title }]

  if (alert.target_type === 'incident_pattern' || alert.target_type === 'incident_trend') {
    for (const id of (data.incident_ids || []) as string[]) evidence.push({ type: 'incident', id, reference: null })
  } else if (alert.target_type === 'training_gap') {
    for (const id of (data.assignment_ids || []) as string[]) evidence.push({ type: 'training_assignment', id, reference: null })
  } else if (alert.target_type === 'inspection_finding' && data.inspection_id) {
    evidence.push({ type: 'inspection', id: String(data.inspection_id), reference: data.inspection_number || null })
  } else {
    evidence.push({ type: alert.target_type, id: alert.target_id, reference: alertReference(alert) })
  }

  return evidence.slice(0, RECOMMENDATION_EVIDENCE_LIMIT)
}

type AlertRule = {
  kind: RecommendationKind
  title: (alert: AlertInput, ref: string) => string
  why: string
  capa?: { action_type: 'corrective' | 'preventive' | 'containment'; root_cause_required: boolean }
  clearsAlert: boolean
}

// What each Watch rule leads to. A rule that is not listed produces no recommendation.
export const ALERT_RECOMMENDATION_RULES: Record<string, AlertRule> = {
  'incident.serious_reported': {
    kind: 'corrective_action',
    title: (_alert, ref) => `Open a corrective action for ${ref}`,
    why: 'A serious or injury incident should have a documented corrective action with a root cause.',
    capa: { action_type: 'corrective', root_cause_required: true },
    clearsAlert: false
  },
  'incident.recurring_type': {
    kind: 'corrective_action',
    title: alert => `Investigate the root cause of ${alert.title.replace(/^Recurring /, 'recurring ')}`,
    why: 'The same type of incident keeps repeating at one location, which points to a cause that has not been fixed.',
    capa: { action_type: 'preventive', root_cause_required: true },
    clearsAlert: true
  },
  'incident.emerging_trend': {
    kind: 'review',
    title: alert => `Review the incident increase: ${alert.title}`,
    why: 'Incidents at this location are running well above its own recent rate.',
    clearsAlert: true
  },
  'inspection.failed': {
    kind: 'corrective_action',
    title: (_alert, ref) => `Correct the deficiencies from failed inspection ${ref}`,
    why: 'A failed inspection is still not closed.',
    capa: { action_type: 'corrective', root_cause_required: false },
    clearsAlert: true
  },
  'observation.high_risk_open': {
    kind: 'corrective_action',
    title: (_alert, ref) => `Control the hazard from high-risk observation ${ref}`,
    why: 'An observation rated in a high risk band is still open.',
    capa: { action_type: 'corrective', root_cause_required: false },
    clearsAlert: true
  },
  'inspection.critical_open_finding': {
    kind: 'escalation',
    title: alert => `Escalate: ${alert.title}`,
    why: 'A critical inspection finding is open.',
    clearsAlert: true
  },
  'inspection.overdue_finding': {
    kind: 'escalation',
    title: alert => `Escalate: ${alert.title}`,
    why: 'A high or critical inspection finding is past its due date.',
    clearsAlert: true
  },
  'training.location_gap': {
    kind: 'training',
    title: alert => `Clear the overdue training: ${alert.title}`,
    why: 'A large share of this location\'s training assignments are overdue.',
    clearsAlert: true
  },
  'risk.review_overdue': {
    kind: 'review',
    title: (_alert, ref) => `Complete the overdue review of ${ref}`,
    why: 'A risk register entry is past its next review date.',
    clearsAlert: true
  },
  'loto.review_due': {
    kind: 'review',
    title: alert => `Complete the LOTO procedure review: ${alert.title.replace(/^LOTO review (overdue|due): /, '')}`,
    why: 'A lockout/tagout procedure is due or overdue for its periodic review.',
    clearsAlert: true
  },
  'asset.poor_condition': {
    kind: 'maintenance',
    title: alert => `Schedule maintenance: ${alert.title.replace(/^Asset condition requires attention: /, '')}`,
    why: 'An asset is recorded in poor condition.',
    clearsAlert: true
  },
  'asset.out_of_service': {
    kind: 'maintenance',
    title: alert => `Plan the return to service: ${alert.title}`,
    why: 'An asset is out of service.',
    clearsAlert: true
  }
}

export const recommendationFromAlert = (alert: AlertInput): RecommendationCandidate | null => {
  const rule = ALERT_RECOMMENDATION_RULES[alert.rule_key]

  if (!rule || (alert.status !== 'open' && alert.status !== 'acknowledged')) return null

  const ref = alertReference(alert) || alert.title
  const priority = PRIORITY_FOR_SEVERITY[alert.severity] || 'medium'
  const title = clip(rule.title(alert, ref), 200)
  const rationale = `${alert.summary} ${rule.why}`
  const criteria: VerificationCriterion[] = []

  if (rule.capa) criteria.push({ type: 'action_completed' })
  if (rule.clearsAlert) criteria.push({ type: 'alert_cleared', alert_id: alert.id })

  return {
    recommendation_key: 'alert:' + alert.id,
    kind: rule.kind,
    title,
    rationale,
    priority,
    source_type: 'watch_alert',
    watch_alert_id: alert.id,
    risk_assessment_id: null,
    rule_key: alert.rule_key,
    factor_key: null,
    scope_type: null,
    scope_id: null,
    location_id: alert.location_id,
    division_id: alert.division_id,
    evidence: alertEvidence(alert),
    proposed_action: rule.capa
      ? {
          action_key: 'corrective_action.create',
          payload: {
            title,
            description: rationale,
            action_type: rule.capa.action_type,
            severity: CAPA_SEVERITY_FOR_PRIORITY[priority],
            source_type: CAPA_SOURCE_FOR_TARGET[alert.target_type] || 'other',
            source_reference: ref,
            location_id: alert.location_id,
            division_id: alert.division_id,
            root_cause_required: rule.capa.root_cause_required
          }
        }
      : null,
    verification_criteria: criteria
  }
}

type FactorRule = {
  kind: RecommendationKind
  title: (scope: string) => string
  capa?: { action_type: 'corrective' | 'preventive' }
}

export const FACTOR_RECOMMENDATION_RULES: Record<string, FactorRule> = {
  injury_rate: {
    kind: 'corrective_action',
    title: scope => `Put a preventive plan in place for the injury rate at ${scope}`,
    capa: { action_type: 'preventive' }
  },
  incident_severity: {
    kind: 'corrective_action',
    title: scope => `Put a preventive plan in place for serious incidents at ${scope}`,
    capa: { action_type: 'preventive' }
  },
  incident_trend: { kind: 'review', title: scope => `Review why incidents are rising at ${scope}` },
  open_findings: { kind: 'escalation', title: scope => `Close the open high and critical inspection findings at ${scope}` },
  overdue_corrective_actions: { kind: 'escalation', title: scope => `Clear the overdue corrective actions at ${scope}` },
  overdue_training: { kind: 'training', title: scope => `Bring overdue training up to date at ${scope}` },
  open_high_risks: { kind: 'review', title: scope => `Review the open high-band risks and observations at ${scope}` }
}

const round = (value: number) => Math.round(value * 10) / 10

// The factors driving an Elevated or High score, largest contribution first.
export const recommendationsFromAssessment = (assessment: AssessmentInput): RecommendationCandidate[] => {
  if (assessment.score == null || !RECOMMENDATION_BANDS.includes(assessment.band)) return []

  const bandLabel = assessment.band === 'high' ? 'High' : 'Elevated'

  const drivers = assessment.indicators
    .filter(
      item =>
        item.available &&
        item.raw_value != null &&
        (item.normalized || 0) >= FACTOR_MIN_NORMALIZED &&
        (item.contribution || 0) > 0 &&
        FACTOR_RECOMMENDATION_RULES[item.factor_key]
    )
    .sort((a, b) => (b.contribution || 0) - (a.contribution || 0))
    .slice(0, FACTORS_PER_ASSESSMENT)

  return drivers.map(indicator => {
    const rule = FACTOR_RECOMMENDATION_RULES[indicator.factor_key]
    const priority: RecommendationPriority = assessment.band === 'high' ? 'high' : 'medium'
    const title = clip(rule.title(assessment.scope_name), 200)

    const rationale =
      `${assessment.scope_name}'s risk indicator is ${assessment.score} (${bandLabel}). ` +
      `${indicator.label} adds ${round((indicator.contribution || 0) * 100)} points: ${indicator.detail}`

    const locationId = assessment.scope_type === 'location' ? assessment.scope_id : null
    const divisionId = assessment.scope_type === 'division' ? assessment.scope_id : null
    const criteria: VerificationCriterion[] = []

    if (rule.capa) criteria.push({ type: 'action_completed' })
    criteria.push({
      type: 'factor_reduced',
      scope_type: assessment.scope_type,
      scope_id: assessment.scope_id,
      factor_key: indicator.factor_key,
      baseline: Number(indicator.raw_value)
    })

    return {
      recommendation_key: `risk:${assessment.scope_type}:${assessment.scope_id}:${indicator.factor_key}`,
      kind: rule.kind,
      title,
      rationale,
      priority,
      source_type: 'risk_assessment' as const,
      watch_alert_id: null,
      risk_assessment_id: assessment.id,
      rule_key: null,
      factor_key: indicator.factor_key,
      scope_type: assessment.scope_type,
      scope_id: assessment.scope_id,
      location_id: locationId,
      division_id: divisionId,
      evidence: [
        { type: 'risk_assessment', id: assessment.id, reference: `${assessment.scope_name} ${assessment.score}` },
        ...indicator.evidence
      ].slice(0, RECOMMENDATION_EVIDENCE_LIMIT),
      proposed_action: rule.capa
        ? {
            action_key: 'corrective_action.create' as const,
            payload: {
              title,
              description: rationale,
              action_type: rule.capa.action_type,
              severity: CAPA_SEVERITY_FOR_PRIORITY[priority],
              source_type: 'other',
              source_reference: `Forge AI risk indicator, ${assessment.scope_name}`,
              location_id: locationId,
              division_id: divisionId,
              root_cause_required: true
            }
          }
        : null,
      verification_criteria: criteria
    }
  })
}

// Facts gathered at verification time.
export type VerificationFacts = {
  alertStatus: (alertId: string) => string | null | undefined
  correctiveAction: { status: string; verification_result: string | null } | null
  latestFactor: (scopeType: string, scopeId: string, factorKey: string) => { raw_value: number | null; computed_at: string } | null
  executedAt: string | null
}

export type VerificationCheck = { criterion: VerificationCriterion['type']; met: boolean; detail: string }

export type VerificationOutcome = { outcome: 'effective' | 'ineffective' | 'pending'; checks: VerificationCheck[] }

export const evaluateVerification = (criteria: VerificationCriterion[], facts: VerificationFacts): VerificationOutcome => {
  const checks: VerificationCheck[] = []
  let ineffective = false

  for (const criterion of criteria) {
    if (criterion.type === 'alert_cleared') {
      const status = facts.alertStatus(criterion.alert_id)
      const met = status === 'resolved'

      checks.push({ criterion: criterion.type, met, detail: met ? 'The Watch alert has cleared.' : `The Watch alert is ${status || 'no longer available'}.` })
    } else if (criterion.type === 'action_completed') {
      const action = facts.correctiveAction

      if (!action) {
        checks.push({ criterion: criterion.type, met: false, detail: 'No corrective action was created yet.' })
        continue
      }

      if (action.verification_result === 'ineffective') ineffective = true

      const met = ['verified', 'closed'].includes(action.status) && action.verification_result !== 'ineffective'

      checks.push({
        criterion: criterion.type,
        met,
        detail: met
          ? `The corrective action is ${action.status}.`
          : `The corrective action is ${action.status.replaceAll('_', ' ')}${action.verification_result ? ` (${action.verification_result.replaceAll('_', ' ')})` : ''}.`
      })
    } else {
      const latest = facts.latestFactor(criterion.scope_type, criterion.scope_id, criterion.factor_key)
      const after = Boolean(latest && facts.executedAt && new Date(latest.computed_at).getTime() > new Date(facts.executedAt).getTime())
      const met = Boolean(after && latest?.raw_value != null && latest.raw_value < criterion.baseline)

      checks.push({
        criterion: criterion.type,
        met,
        detail: !after
          ? 'No risk recalculation since the work was done.'
          : `The factor is ${latest?.raw_value ?? 'unavailable'} now, against ${criterion.baseline} when recommended.`
      })
    }
  }

  if (ineffective) return { outcome: 'ineffective', checks }

  return { outcome: checks.length && checks.every(check => check.met) ? 'effective' : 'pending', checks }
}

// Which recommendations to write, given those that already exist for the same keys.
// A key is skipped while it has a live recommendation, or a closed one from the last 30 days
// (so a dismissed or rejected recommendation does not come straight back).
export const COOLDOWN_DAYS = 30

export const selectNewRecommendations = (
  candidates: RecommendationCandidate[],
  existing: Array<{ recommendation_key: string; status: string; updated_at: string }>,
  now: Date
) => {
  const cutoff = now.getTime() - COOLDOWN_DAYS * 86_400_000

  const blocked = new Set(
    existing
      .filter(row => row.status !== 'superseded')
      .filter(row => LIVE_RECOMMENDATION_STATUSES.includes(row.status) || new Date(row.updated_at).getTime() >= cutoff)
      .map(row => row.recommendation_key)
  )

  const seen = new Set<string>()

  return candidates.filter(candidate => {
    if (blocked.has(candidate.recommendation_key) || seen.has(candidate.recommendation_key)) return false
    seen.add(candidate.recommendation_key)

    return true
  })
}
