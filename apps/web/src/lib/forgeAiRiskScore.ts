// Forge AI risk indicator scoring. Pure and deterministic: the same inputs and model version
// always give the same score. A score is a weighted indicator over real records, not a
// probability, and a scope without enough data gets no score at all.

export type RiskFactorDef = { key: string; label: string; weight: number; saturation: number }
export type RiskBandDef = { key: 'low' | 'moderate' | 'elevated' | 'high'; label: string; min: number }

export type RiskModel = {
  id: string
  model_key: string
  version: number
  window_days: number
  factors: RiskFactorDef[]
  bands: RiskBandDef[]
  min_available_weight: number
}

export type RiskEvidence = { type: string; id: string; reference: string | null }

export type RiskFactorInput = {
  key: string

  // false when the data this factor needs does not exist (for example no hours worked on file)
  available: boolean
  rawValue: number | null
  detail: string
  evidence: RiskEvidence[]
}

export type RiskIndicator = {
  factor_key: string
  label: string
  available: boolean
  raw_value: number | null
  normalized: number | null
  weight: number
  contribution: number | null
  detail: string
  evidence: RiskEvidence[]
}

export type RiskBandKey = RiskBandDef['key'] | 'insufficient_data'

export type RiskScoreResult = {
  score: number | null
  band: RiskBandKey
  availableWeight: number
  indicators: RiskIndicator[]
  reason: string | null
}

// Fewer records than this in a scope means there is too little to say anything about it.
export const RISK_MIN_RECORDS = 5
export const RISK_EVIDENCE_LIMIT = 25

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places

export const bandForScore = (score: number, bands: RiskBandDef[]): RiskBandDef['key'] => {
  const sorted = [...bands].sort((a, b) => b.min - a.min)

  return (sorted.find(band => score >= band.min) || sorted[sorted.length - 1]).key
}

export const computeRiskScore = (
  model: Pick<RiskModel, 'factors' | 'bands' | 'min_available_weight'>,
  inputs: RiskFactorInput[],
  recordCount: number
): RiskScoreResult => {
  const byKey = new Map(inputs.map(input => [input.key, input]))
  const totalWeight = model.factors.reduce((sum, factor) => sum + factor.weight, 0)

  const indicators: RiskIndicator[] = model.factors.map(factor => {
    const input = byKey.get(factor.key)
    const available = Boolean(input?.available && input.rawValue != null && Number.isFinite(input.rawValue))

    if (!available || !input) {
      return {
        factor_key: factor.key,
        label: factor.label,
        available: false,
        raw_value: null,
        normalized: null,
        weight: factor.weight,
        contribution: null,
        detail: input?.detail || 'No data available for this factor.',
        evidence: (input?.evidence || []).slice(0, RISK_EVIDENCE_LIMIT)
      }
    }

    const raw = Math.max(0, Number(input.rawValue))
    const normalized = factor.saturation > 0 ? Math.min(raw / factor.saturation, 1) : 0

    return {
      factor_key: factor.key,
      label: factor.label,
      available: true,
      raw_value: round(raw, 4),
      normalized: round(normalized, 4),
      weight: factor.weight,
      contribution: round(factor.weight * normalized, 4),
      detail: input.detail,
      evidence: input.evidence.slice(0, RISK_EVIDENCE_LIMIT)
    }
  })

  const availableWeightAbs = indicators.filter(item => item.available).reduce((sum, item) => sum + item.weight, 0)
  const availableWeight = totalWeight > 0 ? round(availableWeightAbs / totalWeight, 4) : 0

  if (recordCount < RISK_MIN_RECORDS) {
    return { score: null, band: 'insufficient_data', availableWeight, indicators, reason: `Only ${recordCount} record(s) in this period; at least ${RISK_MIN_RECORDS} are needed.` }
  }

  if (availableWeight < model.min_available_weight) {
    return {
      score: null,
      band: 'insufficient_data',
      availableWeight,
      indicators,
      reason: `Only ${Math.round(availableWeight * 100)}% of the model's factors have data; at least ${Math.round(model.min_available_weight * 100)}% is needed.`
    }
  }

  const contributed = indicators.reduce((sum, item) => sum + (item.contribution || 0), 0)
  const score = round((contributed / availableWeightAbs) * 100, 1)

  return { score, band: bandForScore(score, model.bands), availableWeight, indicators, reason: null }
}

// Incident severity weights for the severity-load factor.
export const INCIDENT_SEVERITY_WEIGHTS: Record<string, number> = { minor: 1, moderate: 3, serious: 9, major: 9, critical: 27, fatal: 27 }

// Risk and observation bands treated as "high" across matrices.
export const HIGH_RISK_BANDS = ['high', 'very_high', 'critical', 'extreme']

// Recent count vs. the prior period's rate per window, as a rise above 1 (0 = flat or falling).
export const trendIncrease = (recent: number, prior: number, recentDays: number, priorDays: number) => {
  const priorRate = priorDays > 0 ? (prior / priorDays) * recentDays : 0

  return Math.max(0, (recent - priorRate) / Math.max(priorRate, 1))
}

// Injuries per 200,000 hours (the OSHA rate basis), with hours prorated to the window.
export const injuryRate = (injuries: number, annualHours: number, windowDays: number) => {
  const hours = (annualHours * windowDays) / 365

  return hours > 0 ? (injuries * 200_000) / hours : null
}
