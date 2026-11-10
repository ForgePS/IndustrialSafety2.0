import { createServiceRoleClient } from '@repo/supabase/server'

import { approveAndExecuteForgeAiAction, prepareRecommendationAction, rejectForgeAiAction } from '@/lib/forgeAiActions'
import { recordForgeAiAudit } from '@/lib/forgeAiExecution'
import {
  ALERT_RECOMMENDATION_RULES,
  LIVE_RECOMMENDATION_STATUSES,
  RECOMMENDATION_BANDS,
  COOLDOWN_DAYS,
  evaluateVerification,
  recommendationFromAlert,
  recommendationsFromAssessment,
  selectNewRecommendations
} from '@/lib/forgeAiRecommendationRules'
import type { AlertInput, AssessmentInput, RecommendationCandidate, VerificationCriterion } from '@/lib/forgeAiRecommendationRules'
import { EVIDENCE_PERMISSIONS, evidenceVisibility, riskScopeVisibility } from '@/lib/forgeAiRisk'
import { getScopedForgeAiWatchAlerts } from '@/lib/forgeAiWatchAccess'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

// Days after the work is done before an unverified recommendation is flagged.
export const VERIFICATION_WINDOW_DAYS = 14

// Module permission each evidence type needs before a viewer may see its reference.
const RECOMMENDATION_EVIDENCE_PERMISSIONS: Record<string, string> = {
  ...EVIDENCE_PERMISSIONS,
  watch_alert: 'forge_ai.view_alerts',
  risk_assessment: 'forge_ai.view_risk',
  inspection_finding: 'inspections.view',
  asset: 'assets_equipment.view',
  asset_maintenance: 'assets_equipment.view',
  loto_procedure: 'loto.view'
}

const db = () => createServiceRoleClient() as any

// Whether a recommendation's location or division is inside a permission's scope. Used for
// viewing and, separately, for reviewing: each permission is checked against its own scope.
const permissionScopeFilter = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}): Promise<(row: { location_id: string | null; division_id: string | null }) => boolean> => {
  if (!permission.allowed) return () => false
  if (permission.scope === 'organization') return () => true
  if (permission.scope !== 'location' && permission.scope !== 'division') return () => false

  const assignments = await getTenantScopeAssignments({ organizationId, userId })
  const { data: locations } = await db().from('locations').select('id, division_id').eq('organization_id', organizationId)
  const divisionOf = new Map<string, string | null>((locations || []).map((row: any) => [row.id, row.division_id]))

  return row =>
    permission.scope === 'location'
      ? Boolean(row.location_id && assignments.locationIds.includes(row.location_id))
      : Boolean(
          (row.division_id && assignments.divisionIds.includes(row.division_id)) ||
            (row.location_id && assignments.divisionIds.includes(divisionOf.get(row.location_id) || ''))
        )
}

type Actor = { userId: string | null; type: 'user' | 'system' }

const logEvent = async ({
  organizationId,
  recommendationId,
  eventType,
  fromStatus,
  toStatus,
  actor,
  detail = {}
}: {
  organizationId: string
  recommendationId: string
  eventType: string
  fromStatus: string | null
  toStatus: string | null
  actor: Actor
  detail?: Record<string, unknown>
}) => {
  const { error } = await db().from('forge_ai_recommendation_events').insert({
    organization_id: organizationId,
    recommendation_id: recommendationId,
    event_type: eventType,
    from_status: fromStatus,
    to_status: toStatus,
    actor_type: actor.type,
    actor_user_id: actor.userId,
    detail
  })

  if (error) throw new Error('Unable to record the recommendation event: ' + error.message)
}

const latestAssessments = async (organizationId: string, bands?: string[]) => {
  const { data: rows, error } = await db()
    .from('forge_ai_risk_assessments')
    .select('id, scope_type, scope_id, scope_name, score, band, computed_at')
    .eq('organization_id', organizationId)
    .order('computed_at', { ascending: false })
    .limit(2000)

  if (error) throw new Error('Unable to load risk indicators: ' + error.message)

  const latest = new Map<string, any>()

  for (const row of rows || []) {
    const key = row.scope_type + ':' + row.scope_id

    if (!latest.has(key)) latest.set(key, row)
  }

  const chosen = [...latest.values()].filter(row => !bands || bands.includes(row.band))

  if (!chosen.length) return []

  const { data: indicators } = await db()
    .from('forge_ai_risk_indicators')
    .select('assessment_id, factor_key, label, available, raw_value, normalized, contribution, detail, evidence')
    .in('assessment_id', chosen.map(row => row.id))

  return chosen.map(row => ({
    ...row,
    score: row.score == null ? null : Number(row.score),
    indicators: (indicators || [])
      .filter((item: any) => item.assessment_id === row.id)
      .map((item: any) => ({
        ...item,
        raw_value: item.raw_value == null ? null : Number(item.raw_value),
        normalized: item.normalized == null ? null : Number(item.normalized),
        contribution: item.contribution == null ? null : Number(item.contribution)
      }))
  })) as Array<AssessmentInput & { computed_at: string }>
}

// Build recommendations from today's evidence: open Watch alerts with a matching rule, and the
// factors driving Elevated or High risk indicators. Live recommendations are kept as they are;
// a proposed one whose condition has cleared is marked superseded.
export const generateForgeAiRecommendations = async ({
  organizationId,
  actorUserId = null,
  now = new Date()
}: {
  organizationId: string
  actorUserId?: string | null
  now?: Date
}) => {
  const supabase = db()

  const { data: alerts, error: alertError } = await supabase
    .from('forge_ai_watch_alerts')
    .select('id, rule_key, severity, status, target_type, target_id, target_reference, title, summary, location_id, division_id, data')
    .eq('organization_id', organizationId)
    .in('status', ['open', 'acknowledged'])
    .in('rule_key', Object.keys(ALERT_RECOMMENDATION_RULES))
    .limit(1000)

  if (alertError) throw new Error('Unable to load Watch alerts: ' + alertError.message)

  const assessments = await latestAssessments(organizationId, RECOMMENDATION_BANDS)

  const candidates: RecommendationCandidate[] = [
    ...((alerts || []) as AlertInput[]).map(recommendationFromAlert).filter((item): item is RecommendationCandidate => Boolean(item)),
    ...assessments.flatMap(recommendationsFromAssessment)
  ]

  const cutoff = new Date(now.getTime() - COOLDOWN_DAYS * 86_400_000).toISOString()

  const [{ data: live }, { data: recent }] = await Promise.all([
    supabase
      .from('forge_ai_recommendations')
      .select('id, recommendation_key, status, updated_at')
      .eq('organization_id', organizationId)
      .in('status', LIVE_RECOMMENDATION_STATUSES),
    supabase
      .from('forge_ai_recommendations')
      .select('id, recommendation_key, status, updated_at')
      .eq('organization_id', organizationId)
      .not('status', 'in', '(' + LIVE_RECOMMENDATION_STATUSES.join(',') + ')')
      .gte('updated_at', cutoff)
  ])

  const fresh = selectNewRecommendations(candidates, [...(live || []), ...(recent || [])], now)
  const actor: Actor = { userId: actorUserId, type: actorUserId ? 'user' : 'system' }
  let created = 0

  for (const candidate of fresh) {
    const { data: row, error } = await supabase
      .from('forge_ai_recommendations')
      .insert({ organization_id: organizationId, ...candidate, status: 'proposed', generated_at: now.toISOString() })
      .select('id')
      .single()

    // Another run created the same live recommendation first.
    if (error?.code === '23505') continue
    if (error || !row) throw new Error('Unable to save the recommendation: ' + (error?.message || 'no row'))

    created += 1
    await logEvent({
      organizationId,
      recommendationId: row.id,
      eventType: 'generated',
      fromStatus: null,
      toStatus: 'proposed',
      actor,
      detail: { source_type: candidate.source_type, rule_key: candidate.rule_key, factor_key: candidate.factor_key, evidence: candidate.evidence.length }
    })
  }

  // A proposal nobody has acted on goes away when its condition clears.
  const candidateKeys = new Set(candidates.map(item => item.recommendation_key))
  const stale = (live || []).filter((row: any) => row.status === 'proposed' && !candidateKeys.has(row.recommendation_key))
  let superseded = 0

  for (const row of stale) {
    const { data: updated } = await supabase
      .from('forge_ai_recommendations')
      .update({ status: 'superseded', updated_at: now.toISOString() })
      .eq('id', row.id)
      .eq('status', 'proposed')
      .select('id')
      .maybeSingle()

    if (!updated) continue

    superseded += 1
    await logEvent({
      organizationId,
      recommendationId: row.id,
      eventType: 'superseded',
      fromStatus: 'proposed',
      toStatus: 'superseded',
      actor: { userId: null, type: 'system' },
      detail: { reason: 'The condition behind this recommendation is no longer present.' }
    })
  }

  await recordForgeAiAudit({
    organizationId,
    actorUserId,
    actorType: actorUserId ? 'user' : 'system',
    eventType: 'recommendations.generated',
    resourceType: 'forge_ai_recommendation',
    detail: { candidates: candidates.length, created, superseded }
  })

  return { candidates: candidates.length, created, superseded }
}

// Check executed recommendations against the same facts that produced them. Effective work is
// marked verified; a corrective action verified as ineffective marks the recommendation failed;
// anything else waits, and is flagged once the verification window has passed.
export const verifyForgeAiRecommendations = async ({ organizationId, now = new Date() }: { organizationId: string; now?: Date }) => {
  const supabase = db()

  const { data: rows, error } = await supabase
    .from('forge_ai_recommendations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'executed')
    .limit(500)

  if (error) throw new Error('Unable to load recommendations to verify: ' + error.message)
  if (!rows?.length) return { checked: 0, verified: 0, failed: 0, overdue: 0 }

  const criteria: VerificationCriterion[] = rows.flatMap((row: any) => (row.verification_criteria || []) as VerificationCriterion[])
  const alertIds = [...new Set(criteria.filter(item => item.type === 'alert_cleared').map(item => (item as any).alert_id))]
  const capaIds = rows.filter((row: any) => row.result_entity_type === 'corrective_action' && row.result_entity_id).map((row: any) => row.result_entity_id)

  const [{ data: alerts }, { data: capas }, assessments] = await Promise.all([
    alertIds.length
      ? supabase.from('forge_ai_watch_alerts').select('id, status').eq('organization_id', organizationId).in('id', alertIds)
      : Promise.resolve({ data: [] }),
    capaIds.length
      ? supabase.from('forge_corrective_actions').select('id, status, verification_result').eq('organization_id', organizationId).in('id', capaIds)
      : Promise.resolve({ data: [] }),
    criteria.some(item => item.type === 'factor_reduced') ? latestAssessments(organizationId) : Promise.resolve([])
  ])

  const alertStatus = new Map<string, string>((alerts || []).map((row: any) => [row.id, row.status]))
  const capaById = new Map<string, any>((capas || []).map((row: any) => [row.id, row]))
  const assessmentByScope = new Map<string, any>(assessments.map(row => [row.scope_type + ':' + row.scope_id, row]))
  const counts = { checked: rows.length, verified: 0, failed: 0, overdue: 0 }

  for (const row of rows) {
    const result = evaluateVerification(row.verification_criteria || [], {
      alertStatus: id => alertStatus.get(id) ?? null,
      correctiveAction: row.result_entity_type === 'corrective_action' ? capaById.get(row.result_entity_id) || null : null,
      latestFactor: (scopeType, scopeId, factorKey) => {
        const assessment = assessmentByScope.get(scopeType + ':' + scopeId)
        const indicator = assessment?.indicators.find((item: any) => item.factor_key === factorKey)

        return assessment ? { raw_value: indicator?.available ? indicator.raw_value : null, computed_at: assessment.computed_at } : null
      },
      executedAt: row.executed_at
    })

    const due = row.verification_due_at && new Date(row.verification_due_at).getTime() <= now.getTime()

    if (result.outcome === 'pending') {
      if (!due || row.verification_result?.overdue) continue

      await supabase
        .from('forge_ai_recommendations')
        .update({ verification_result: { ...result, method: 'automatic', overdue: true, checked_at: now.toISOString() }, updated_at: now.toISOString() })
        .eq('id', row.id)
        .eq('status', 'executed')
      await logEvent({
        organizationId,
        recommendationId: row.id,
        eventType: 'verification.overdue',
        fromStatus: 'executed',
        toStatus: 'executed',
        actor: { userId: null, type: 'system' },
        detail: { checks: result.checks }
      })
      counts.overdue += 1
      continue
    }

    const nextStatus = result.outcome === 'effective' ? 'verified' : 'failed'

    const { data: updated } = await supabase
      .from('forge_ai_recommendations')
      .update({
        status: nextStatus,
        verification_result: { ...result, method: 'automatic', checked_at: now.toISOString() },
        verified_at: now.toISOString(),
        verified_by: null,
        updated_at: now.toISOString()
      })
      .eq('id', row.id)
      .eq('status', 'executed')
      .select('id')
      .maybeSingle()

    if (!updated) continue

    await logEvent({
      organizationId,
      recommendationId: row.id,
      eventType: 'verification.' + result.outcome,
      fromStatus: 'executed',
      toStatus: nextStatus,
      actor: { userId: null, type: 'system' },
      detail: { checks: result.checks, method: 'automatic' }
    })

    if (nextStatus === 'verified') counts.verified += 1
    else counts.failed += 1
  }

  if (counts.verified || counts.failed || counts.overdue) {
    await recordForgeAiAudit({
      organizationId,
      actorType: 'system',
      eventType: 'recommendations.verified',
      resourceType: 'forge_ai_recommendation',
      detail: counts
    })
  }

  return counts
}

const permissionFor = (permissionByKey: Map<string, EffectivePermission>, key: string) => {
  const permission = permissionByKey.get(key)

  return permission?.allowed ? permission : null
}

// Recommendations a user may see. Three checks apply together:
//  1. their AI Recommendations scope covers the recommendation's location or division;
//  2. they can see its source: the Watch alert in AI Watch, or the scope in Risk Indicators;
//  3. evidence from modules they cannot open is removed (the count stays).
export const getScopedForgeAiRecommendations = async ({
  organizationId,
  userId,
  permissionByKey,
  recommendationId = null,
  includeEvents = false,
  limit = 300
}: {
  organizationId: string
  userId: string
  permissionByKey: Map<string, EffectivePermission>
  recommendationId?: string | null
  includeEvents?: boolean
  limit?: number
}) => {
  const viewPermission = permissionFor(permissionByKey, 'forge_ai.view_recommendations')

  if (!viewPermission) return []

  const supabase = db()
  let query = supabase.from('forge_ai_recommendations').select('*').eq('organization_id', organizationId)

  query = recommendationId ? query.eq('id', recommendationId) : query.order('generated_at', { ascending: false }).limit(limit)

  const { data: rows, error } = await query

  if (error) throw new Error('Unable to load recommendations: ' + error.message)
  if (!rows?.length) return []

  const inViewScope = await permissionScopeFilter({ organizationId, userId, permission: viewPermission })
  let scoped = (rows as any[]).filter(inViewScope)

  const alertPermission = permissionFor(permissionByKey, 'forge_ai.view_alerts')
  const riskPermission = permissionFor(permissionByKey, 'forge_ai.view_risk')
  const needsAlerts = scoped.some(row => row.source_type === 'watch_alert')
  const needsRisk = scoped.some(row => row.source_type === 'risk_assessment')

  const [visibleAlerts, canSeeScope] = await Promise.all([
    needsAlerts && alertPermission
      ? getScopedForgeAiWatchAlerts({ organizationId, userId, alertPermission, permissionByKey })
      : Promise.resolve([]),
    needsRisk && riskPermission
      ? riskScopeVisibility({ organizationId, userId, permission: riskPermission })
      : Promise.resolve(() => false)
  ])

  const alertIds = new Set((visibleAlerts as any[]).map(alert => alert.id))

  scoped = scoped.filter(row =>
    row.source_type === 'watch_alert'
      ? Boolean(row.watch_alert_id && alertIds.has(row.watch_alert_id))
      : (canSeeScope as (type: string, id: string) => boolean)(row.scope_type, row.scope_id)
  )

  if (!scoped.length) return []

  const approvalIds = scoped.map(row => row.action_approval_id).filter(Boolean)

  const [{ data: approvals }, { data: events }] = await Promise.all([
    approvalIds.length
      ? supabase
          .from('forge_ai_action_approvals')
          .select('id, status, requested_by, approved_by, approval_expires_at, execution_result')
          .in('id', approvalIds)
      : Promise.resolve({ data: [] }),
    includeEvents
      ? supabase
          .from('forge_ai_recommendation_events')
          .select('id, recommendation_id, event_type, from_status, to_status, actor_type, actor_user_id, detail, created_at')
          .in('recommendation_id', scoped.map(row => row.id))
          .order('id')
      : Promise.resolve({ data: [] })
  ])

  const approvalById = new Map<string, any>((approvals || []).map((row: any) => [row.id, row]))
  // Module records (incidents, training, inspections, tasks, risks, observations) must be in the
  // viewer's own scoped list for that module. The other types are the source alert and its target,
  // which the viewer can already open because the source alert passed the AI Watch scope checks.
  const recordVisible = await evidenceVisibility({
    organizationId,
    userId,
    permissionByKey,
    types: scoped.flatMap(row => (row.evidence || []).map((item: any) => item.type))
  })
  const canSee = (item: { type: string; id: string; reference: string | null }) =>
    item.type in EVIDENCE_PERMISSIONS
      ? recordVisible(item)
      : Boolean(permissionFor(permissionByKey, RECOMMENDATION_EVIDENCE_PERMISSIONS[item.type] || ''))

  return scoped.map(row => {
    const evidence = (row.evidence || []) as Array<{ type: string; id: string; reference: string | null }>
    const shown = evidence.filter(canSee)

    return {
      ...row,
      evidence: shown,
      hidden_evidence: evidence.length - shown.length,
      approval: row.action_approval_id ? approvalById.get(row.action_approval_id) || null : null,
      events: includeEvents ? (events || []).filter((event: any) => event.recommendation_id === row.id) : []
    }
  })
}

type ReviewContext = {
  organizationId: string
  userId: string
  permissionByKey: Map<string, EffectivePermission>
  recommendationId: string
}

// A reviewer needs the review permission, must be able to see the recommendation, and its
// location or division must be inside the review permission's own scope (which can be narrower
// than the view permission's).
const loadForReview = async ({ organizationId, userId, permissionByKey, recommendationId }: ReviewContext) => {
  const reviewPermission = permissionFor(permissionByKey, 'forge_ai.review_recommendations')

  if (!reviewPermission) {
    return { error: 'You do not have permission to review AI recommendations.' } as const
  }

  const [recommendation] = await getScopedForgeAiRecommendations({ organizationId, userId, permissionByKey, recommendationId })

  if (!recommendation) return { error: 'Recommendation not found.' } as const

  const inReviewScope = await permissionScopeFilter({ organizationId, userId, permission: reviewPermission })

  if (!inReviewScope(recommendation)) {
    return { error: 'This recommendation is outside the locations you can review.' } as const
  }

  return { recommendation }
}

// Move a recommendation between states only if it is still in an expected state, and log it.
const transition = async ({
  organizationId,
  recommendation,
  from,
  to,
  patch,
  eventType,
  actorUserId,
  detail = {}
}: {
  organizationId: string
  recommendation: any
  from: string[]
  to: string
  patch: Record<string, unknown>
  eventType: string
  actorUserId: string
  detail?: Record<string, unknown>
}) => {
  if (!from.includes(recommendation.status)) {
    return { error: `This recommendation is ${recommendation.status.replaceAll('_', ' ')} and cannot be changed this way.` }
  }

  const now = new Date().toISOString()

  const { data: updated, error } = await db()
    .from('forge_ai_recommendations')
    .update({ ...patch, status: to, updated_at: now })
    .eq('organization_id', organizationId)
    .eq('id', recommendation.id)
    .eq('status', recommendation.status)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!updated) return { error: 'This recommendation was changed by someone else. Refresh and try again.' }

  await logEvent({
    organizationId,
    recommendationId: recommendation.id,
    eventType,
    fromStatus: recommendation.status,
    toStatus: to,
    actor: { userId: actorUserId, type: 'user' },
    detail
  })

  await recordForgeAiAudit({
    organizationId,
    actorUserId,
    eventType: 'recommendation.' + eventType,
    resourceType: 'forge_ai_recommendation',
    resourceId: recommendation.id,
    detail: { from: recommendation.status, to, ...detail }
  })

  return { ok: true as const }
}

const cleanNote = (value: unknown, max = 2000) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// Advisory recommendations (no proposed action): the reviewer accepts that people will do the work.
export const acceptForgeAiRecommendation = async (context: ReviewContext & { note?: string }) => {
  const loaded = await loadForReview(context)

  if ('error' in loaded) return { error: loaded.error }
  if (loaded.recommendation.proposed_action) return { error: 'This recommendation has a proposed action. Submit it for approval instead.' }

  const result = await transition({
    organizationId: context.organizationId,
    recommendation: loaded.recommendation,
    from: ['proposed'],
    to: 'approved',
    patch: { reviewed_by: context.userId, reviewed_at: new Date().toISOString(), review_note: cleanNote(context.note) || null },
    eventType: 'accepted',
    actorUserId: context.userId,
    detail: { note: cleanNote(context.note) || null }
  })

  return 'error' in result ? result : { message: 'Recommendation accepted.' }
}

// Recommendations with a proposed action: queue the action in the approval engine.
export const submitForgeAiRecommendation = async (
  context: ReviewContext & { edits?: { title?: string; description?: string } }
) => {
  const loaded = await loadForReview(context)

  if ('error' in loaded) return { error: loaded.error }

  const recommendation = loaded.recommendation
  const proposed = recommendation.proposed_action

  if (!proposed) return { error: 'This recommendation has no proposed action. Accept it instead.' }

  if (!permissionFor(context.permissionByKey, 'forge_ai.run_actions')) {
    return { error: 'Sending an action for approval needs the Run AI Actions permission.' }
  }

  if (recommendation.status !== 'proposed') return { error: 'Only a proposed recommendation can be submitted for approval.' }

  const payload = { ...(proposed.payload || {}) }
  const title = cleanNote(context.edits?.title, 200)
  const description = cleanNote(context.edits?.description, 4000)

  if (title) payload.title = title
  if (description) payload.description = description

  const prepared = await prepareRecommendationAction({
    organizationId: context.organizationId,
    userId: context.userId,
    permissionByKey: context.permissionByKey,
    actionKey: proposed.action_key,
    rawPayload: payload,
    recommendationId: recommendation.id,
    recommendationTitle: recommendation.title
  })

  if ('error' in prepared) return { error: prepared.error }

  const result = await transition({
    organizationId: context.organizationId,
    recommendation,
    from: ['proposed'],
    to: 'in_review',
    patch: {
      action_approval_id: prepared.approvalId,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
      proposed_action: { ...proposed, payload: prepared.payload }
    },
    eventType: 'submitted',
    actorUserId: context.userId,
    detail: { approval_id: prepared.approvalId, action_key: proposed.action_key, edited: Boolean(title || description) }
  })

  if ('error' in result) {
    // The recommendation moved on while the request was prepared: withdraw the request.
    await db().from('forge_ai_action_approvals').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', prepared.approvalId).eq('status', 'pending')

    return result
  }

  return { message: 'Sent for approval. Nothing is created until an authorized person approves it.', approvalId: prepared.approvalId }
}

// Approve or reject the queued action. The approval engine re-checks the requester's and the
// approver's module permissions and scope; its status change moves the recommendation.
export const decideForgeAiRecommendation = async (
  context: ReviewContext & { decision: 'approve' | 'reject'; reason?: string }
) => {
  const loaded = await loadForReview(context)

  if ('error' in loaded) return { error: loaded.error }

  const recommendation = loaded.recommendation

  if (recommendation.status !== 'in_review' || !recommendation.action_approval_id) {
    return { error: 'This recommendation is not waiting for approval.' }
  }

  if (!permissionFor(context.permissionByKey, 'forge_ai.approve_actions')) {
    return { error: 'Approving or rejecting AI actions needs the Approve AI Actions permission.' }
  }

  if (context.decision === 'reject') {
    const reason = cleanNote(context.reason)

    if (!reason) return { error: 'Give a reason for rejecting the action.' }

    const result = await rejectForgeAiAction({
      organizationId: context.organizationId,
      approverUserId: context.userId,
      approvalId: recommendation.action_approval_id,
      reason
    })

    return 'error' in result ? { error: result.error } : { message: 'Action rejected. The recommendation is closed.' }
  }

  const result: any = await approveAndExecuteForgeAiAction({
    organizationId: context.organizationId,
    approverUserId: context.userId,
    approvalId: recommendation.action_approval_id
  })

  if (result?.error) return { error: String(result.error) }

  return { message: result?.message || 'Action approved and carried out.', result: result?.result || null }
}

export const dismissForgeAiRecommendation = async (context: ReviewContext & { reason: string }) => {
  const loaded = await loadForReview(context)

  if ('error' in loaded) return { error: loaded.error }

  const reason = cleanNote(context.reason)

  if (!reason) return { error: 'Give a reason for dismissing the recommendation.' }

  const result = await transition({
    organizationId: context.organizationId,
    recommendation: loaded.recommendation,
    from: ['proposed', 'approved'],
    to: 'dismissed',
    patch: { reviewed_by: context.userId, reviewed_at: new Date().toISOString(), review_note: reason },
    eventType: 'dismissed',
    actorUserId: context.userId,
    detail: { reason }
  })

  return 'error' in result ? result : { message: 'Recommendation dismissed.' }
}

// Advisory work done by people: record it, then verification checks the facts.
export const completeForgeAiRecommendation = async (context: ReviewContext & { note: string }) => {
  const loaded = await loadForReview(context)

  if ('error' in loaded) return { error: loaded.error }
  if (loaded.recommendation.proposed_action) return { error: 'This recommendation is completed by its approved action.' }

  const note = cleanNote(context.note)

  if (!note) return { error: 'Describe what was done.' }

  const now = Date.now()

  const result = await transition({
    organizationId: context.organizationId,
    recommendation: loaded.recommendation,
    from: ['approved'],
    to: 'executed',
    patch: {
      executed_at: new Date(now).toISOString(),
      verification_due_at: new Date(now + VERIFICATION_WINDOW_DAYS * 86_400_000).toISOString(),
      review_note: note
    },
    eventType: 'completed',
    actorUserId: context.userId,
    detail: { note }
  })

  return 'error' in result ? result : { message: 'Marked done. Forge AI will check the evidence to verify it.' }
}

// A person confirms whether the work was effective, with the current fact checks recorded.
export const verifyForgeAiRecommendationManually = async (
  context: ReviewContext & { outcome: 'effective' | 'ineffective'; note: string }
) => {
  const loaded = await loadForReview(context)

  if ('error' in loaded) return { error: loaded.error }

  const note = cleanNote(context.note)

  if (!note) return { error: 'Describe how the result was checked.' }

  const recommendation = loaded.recommendation
  const nextStatus = context.outcome === 'effective' ? 'verified' : 'failed'
  const now = new Date().toISOString()

  const result = await transition({
    organizationId: context.organizationId,
    recommendation,
    from: ['executed'],
    to: nextStatus,
    patch: {
      verified_by: context.userId,
      verified_at: now,
      verification_result: {
        outcome: context.outcome,
        method: 'manual',
        note,
        automatic: recommendation.verification_result || null,
        checked_at: now
      }
    },
    eventType: 'verification.' + context.outcome,
    actorUserId: context.userId,
    detail: { note, method: 'manual' }
  })

  return 'error' in result ? result : { message: context.outcome === 'effective' ? 'Recommendation verified.' : 'Recommendation marked not effective.' }
}
