import { createServiceRoleClient } from '@repo/supabase/server'

type WatchCandidate = {
  ruleKey: string
  targetType: string
  targetId: string
  targetReference: string | null
  title: string
  summary: string
  locationId: string | null
  divisionId: string | null
  data: Record<string, unknown>
}

type WatchRule = {
  id: string
  organization_id: string
  enabled: boolean
  config: Record<string, unknown>
  name_override: string | null
  severity_override: 'info' | 'warning' | 'high' | 'critical' | null
  forge_ai_watch_rule_templates: {
    rule_key: string
    name: string
    severity: 'info' | 'warning' | 'high' | 'critical'
    required_permission_key: string
  }
}

const integerConfig = (
  config: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
  min: number,
  max: number
) => {
  const parsed = Number(config?.[key])
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

const daysBetween = (earlier: string, later = new Date()) => {
  const start = new Date(earlier + (earlier.length === 10 ? 'T00:00:00Z' : ''))
  return Math.max(0, Math.floor((later.getTime() - start.getTime()) / 86_400_000))
}

const evaluateTrainingOverdue = async (
  supabase: any,
  organizationId: string,
  config: Record<string, unknown>
): Promise<WatchCandidate[]> => {
  const minimumDays = integerConfig(config, 'days_overdue', 1, 0, 3650)
  const cutoff = new Date(Date.now() - minimumDays * 86_400_000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('forge_training_assignments')
    .select('id, status, due_date, forge_training_courses(title, course_code), forge_personnel(id, first_name, last_name, employee_number, location_id, division_id)')
    .eq('organization_id', organizationId)
    .lt('due_date', cutoff)
    .not('status', 'in', '(completed,canceled)')
    .order('due_date')

  if (error) throw new Error('Overdue training watch failed: ' + error.message)

  return (data || []).map((row: any) => {
    const person = row.forge_personnel
    const course = row.forge_training_courses
    const personName = person
      ? [person.first_name, person.last_name].filter(Boolean).join(' ')
      : 'Personnel record'

    return {
      ruleKey: 'training.overdue',
      targetType: 'training_assignment',
      targetId: row.id,
      targetReference: course?.course_code || null,
      title: 'Overdue training: ' + (course?.title || 'Training assignment'),
      summary:
        personName +
        ' is ' +
        String(daysBetween(row.due_date)) +
        ' day(s) past the due date' +
        (row.due_date ? ' (' + row.due_date + ').' : '.'),
      locationId: person?.location_id || null,
      divisionId: person?.division_id || null,
      data: {
        due_date: row.due_date,
        status: row.status,
        course_title: course?.title || null,
        course_code: course?.course_code || null,
        personnel_name: personName,
        employee_number: person?.employee_number || null,
        path: '/training'
      }
    }
  })
}

const evaluateCriticalInspectionFindings = async (
  supabase: any,
  organizationId: string
): Promise<WatchCandidate[]> => {
  const { data, error } = await supabase
    .from('forge_inspection_findings')
    .select('id, title, description, severity, status, due_date, inspection_id, forge_inspections(inspection_number, location_id, division_id)')
    .eq('organization_id', organizationId)
    .eq('severity', 'critical')
    .not('status', 'in', '(closed,canceled)')
    .order('created_at')

  if (error) throw new Error('Critical inspection finding watch failed: ' + error.message)

  return (data || []).map((row: any) => ({
    ruleKey: 'inspection.critical_open_finding',
    targetType: 'inspection_finding',
    targetId: row.id,
    targetReference: row.forge_inspections?.inspection_number || null,
    title: 'Critical inspection finding: ' + row.title,
    summary:
      'Critical finding remains ' +
      String(row.status).replaceAll('_', ' ') +
      (row.due_date ? ' with due date ' + row.due_date + '.' : '.'),
    locationId: row.forge_inspections?.location_id || null,
    divisionId: row.forge_inspections?.division_id || null,
    data: {
      finding_title: row.title,
      finding_status: row.status,
      due_date: row.due_date,
      inspection_id: row.inspection_id,
      inspection_number: row.forge_inspections?.inspection_number || null,
      path: row.inspection_id ? '/inspections/' + row.inspection_id : '/inspections'
    }
  }))
}

const evaluateOverdueInspectionFindings = async (
  supabase: any,
  organizationId: string,
  config: Record<string, unknown>
): Promise<WatchCandidate[]> => {
  const minimumDays = integerConfig(config, 'days_overdue', 1, 0, 3650)
  const cutoff = new Date(Date.now() - minimumDays * 86_400_000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('forge_inspection_findings')
    .select('id, title, description, severity, status, due_date, inspection_id, forge_inspections(inspection_number, location_id, division_id)')
    .eq('organization_id', organizationId)
    .lt('due_date', cutoff)
    .not('status', 'in', '(closed,canceled)')
    .order('due_date')

  if (error) throw new Error('Overdue inspection finding watch failed: ' + error.message)

  return (data || []).map((row: any) => ({
    ruleKey: 'inspection.overdue_finding',
    targetType: 'inspection_finding',
    targetId: row.id,
    targetReference: row.forge_inspections?.inspection_number || null,
    title: 'Overdue inspection finding: ' + row.title,
    summary:
      'Finding is ' +
      String(daysBetween(row.due_date)) +
      ' day(s) overdue and remains ' +
      String(row.status).replaceAll('_', ' ') +
      '.',
    locationId: row.forge_inspections?.location_id || null,
    divisionId: row.forge_inspections?.division_id || null,
    data: {
      severity: row.severity,
      due_date: row.due_date,
      finding_status: row.status,
      inspection_id: row.inspection_id,
      inspection_number: row.forge_inspections?.inspection_number || null,
      path: row.inspection_id ? '/inspections/' + row.inspection_id : '/inspections'
    }
  }))
}

const evaluateAssetsByState = async (
  supabase: any,
  organizationId: string,
  ruleKey: 'asset.out_of_service' | 'asset.poor_condition'
): Promise<WatchCandidate[]> => {
  let query = supabase
    .from('forge_assets')
    .select('id, asset_number, name, status, condition, criticality, location_id, division_id')
    .eq('organization_id', organizationId)
    .is('retired_at', null)
    .order('name')

  query = ruleKey === 'asset.out_of_service'
    ? query.eq('status', 'out_of_service')
    : query.in('condition', ['poor','unserviceable'])

  const { data, error } = await query
  if (error) throw new Error('Asset condition watch failed: ' + error.message)

  return (data || []).map((row: any) => ({
    ruleKey,
    targetType: 'asset',
    targetId: row.id,
    targetReference: row.asset_number,
    title:
      ruleKey === 'asset.out_of_service'
        ? 'Asset out of service: ' + row.name
        : 'Asset condition requires attention: ' + row.name,
    summary:
      ruleKey === 'asset.out_of_service'
        ? row.asset_number + ' is currently marked Out of Service.'
        : row.asset_number + ' is currently in ' + String(row.condition).replaceAll('_', ' ') + ' condition.',
    locationId: row.location_id,
    divisionId: row.division_id,
    data: {
      asset_number: row.asset_number,
      asset_name: row.name,
      status: row.status,
      condition: row.condition,
      criticality: row.criticality,
      path: '/assets/' + row.id
    }
  }))
}

const evaluateMaintenanceDue = async (
  supabase: any,
  organizationId: string,
  config: Record<string, unknown>
): Promise<WatchCandidate[]> => {
  const daysAhead = integerConfig(config, 'days_ahead', 14, 0, 365)
  const today = new Date().toISOString().slice(0, 10)
  const through = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('forge_asset_maintenance')
    .select('id, asset_id, maintenance_type, next_due_date, description, forge_assets(asset_number, name, status, location_id, division_id, retired_at)')
    .eq('organization_id', organizationId)
    .not('next_due_date', 'is', null)
    .lte('next_due_date', through)
    .order('next_due_date')

  if (error) throw new Error('Maintenance due watch failed: ' + error.message)

  return (data || [])
    .filter((row: any) => !row.forge_assets?.retired_at)
    .map((row: any) => {
      const overdue = row.next_due_date < today
      const asset = row.forge_assets

      return {
        ruleKey: 'asset.maintenance_due',
        targetType: 'asset_maintenance',
        targetId: row.id,
        targetReference: asset?.asset_number || null,
        title: (overdue ? 'Asset maintenance overdue: ' : 'Asset maintenance due: ') + (asset?.name || 'Asset'),
        summary:
          (asset?.asset_number || 'Asset') +
          ' has ' +
          String(row.maintenance_type).replaceAll('_', ' ') +
          ' maintenance ' +
          (overdue
            ? String(daysBetween(row.next_due_date)) + ' day(s) overdue.'
            : 'due by ' + row.next_due_date + '.'),
        locationId: asset?.location_id || null,
        divisionId: asset?.division_id || null,
        data: {
          asset_id: row.asset_id,
          asset_number: asset?.asset_number || null,
          asset_name: asset?.name || null,
          maintenance_type: row.maintenance_type,
          next_due_date: row.next_due_date,
          overdue,
          path: row.asset_id ? '/assets/' + row.asset_id : '/assets'
        }
      }
    })
}

const evaluateIncidentsAwaitingReview = async (
  supabase: any,
  organizationId: string,
  config: Record<string, unknown>
): Promise<WatchCandidate[]> => {
  const minimumAgeHours = integerConfig(config, 'minimum_age_hours', 24, 0, 24 * 365)
  const cutoff = new Date(Date.now() - minimumAgeHours * 3_600_000).toISOString()

  const { data, error } = await supabase
    .from('forge_incidents')
    .select('id, incident_number, summary, severity, status, submitted_at, location_id, division_id')
    .eq('organization_id', organizationId)
    .eq('status', 'submitted')
    .lte('submitted_at', cutoff)
    .order('submitted_at')

  if (error) throw new Error('Incident review watch failed: ' + error.message)

  return (data || []).map((row: any) => {
    const hours = row.submitted_at
      ? Math.max(0, Math.floor((Date.now() - new Date(row.submitted_at).getTime()) / 3_600_000))
      : minimumAgeHours

    return {
      ruleKey: 'incident.awaiting_review',
      targetType: 'incident',
      targetId: row.id,
      targetReference: row.incident_number,
      title: 'Incident awaiting review: ' + row.incident_number,
      summary: 'Submitted incident has been awaiting review for approximately ' + String(hours) + ' hour(s).',
      locationId: row.location_id,
      divisionId: row.division_id,
      data: {
        incident_number: row.incident_number,
        summary: row.summary,
        severity: row.severity,
        submitted_at: row.submitted_at,
        path: '/incidents/' + row.id
      }
    }
  })
}

const evaluateRule = async (
  supabase: any,
  organizationId: string,
  rule: WatchRule
): Promise<WatchCandidate[]> => {
  const ruleKey = rule.forge_ai_watch_rule_templates.rule_key
  const config = rule.config || {}

  if (ruleKey === 'training.overdue') {
    return evaluateTrainingOverdue(supabase, organizationId, config)
  }
  if (ruleKey === 'inspection.critical_open_finding') {
    return evaluateCriticalInspectionFindings(supabase, organizationId)
  }
  if (ruleKey === 'inspection.overdue_finding') {
    return evaluateOverdueInspectionFindings(supabase, organizationId, config)
  }
  if (ruleKey === 'asset.out_of_service' || ruleKey === 'asset.poor_condition') {
    return evaluateAssetsByState(supabase, organizationId, ruleKey)
  }
  if (ruleKey === 'asset.maintenance_due') {
    return evaluateMaintenanceDue(supabase, organizationId, config)
  }
  if (ruleKey === 'incident.awaiting_review') {
    return evaluateIncidentsAwaitingReview(supabase, organizationId, config)
  }

  return []
}

export const runForgeAiWatch = async ({
  organizationId,
  triggerType,
  startedBy = null
}: {
  organizationId: string
  triggerType: 'manual' | 'scheduled' | 'system'
  startedBy?: string | null
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: run, error: runError } = await supabase
    .from('forge_ai_watch_runs')
    .insert({
      organization_id: organizationId,
      trigger_type: triggerType,
      started_by: startedBy,
      status: 'running'
    })
    .select('*')
    .single()

  if (runError || !run) {
    throw new Error(runError?.message || 'Unable to start Forge AI Watch run.')
  }

  try {
    const { data: rules, error: rulesError } = await supabase
      .from('forge_ai_watch_rules')
      .select('*, forge_ai_watch_rule_templates(*)')
      .eq('organization_id', organizationId)
      .eq('enabled', true)

    if (rulesError) throw new Error(rulesError.message)

    let alertsCreated = 0
    let alertsRefreshed = 0
    let alertsResolved = 0

    for (const rule of (rules || []) as WatchRule[]) {
      const template = rule.forge_ai_watch_rule_templates
      if (!template) continue

      const candidates = await evaluateRule(supabase, organizationId, rule)
      const activeDedupeKeys = new Set<string>()
      const now = new Date().toISOString()
      const severity = rule.severity_override || template.severity

      for (const candidate of candidates) {
        const dedupeKey = candidate.ruleKey + ':' + candidate.targetType + ':' + candidate.targetId
        activeDedupeKeys.add(dedupeKey)

        const { data: existing } = await supabase
          .from('forge_ai_watch_alerts')
          .select('id, status')
          .eq('organization_id', organizationId)
          .eq('dedupe_key', dedupeKey)
          .maybeSingle()

        if (!existing) {
          const { error } = await supabase
            .from('forge_ai_watch_alerts')
            .insert({
              organization_id: organizationId,
              watch_rule_id: rule.id,
              rule_key: candidate.ruleKey,
              severity,
              status: 'open',
              target_type: candidate.targetType,
              target_id: candidate.targetId,
              target_reference: candidate.targetReference,
              title: candidate.title,
              summary: candidate.summary,
              location_id: candidate.locationId,
              division_id: candidate.divisionId,
              data: candidate.data,
              dedupe_key: dedupeKey,
              first_detected_at: now,
              last_detected_at: now
            })

          if (error) throw new Error(error.message)
          alertsCreated += 1
        } else {
          const nextStatus = existing.status === 'resolved' ? 'open' : existing.status
          const { error } = await supabase
            .from('forge_ai_watch_alerts')
            .update({
              watch_rule_id: rule.id,
              severity,
              status: nextStatus,
              target_reference: candidate.targetReference,
              title: candidate.title,
              summary: candidate.summary,
              location_id: candidate.locationId,
              division_id: candidate.divisionId,
              data: candidate.data,
              last_detected_at: now,
              resolved_at: nextStatus === 'open' ? null : undefined,
              resolved_by: nextStatus === 'open' ? null : undefined,
              updated_at: now
            })
            .eq('id', existing.id)

          if (error) throw new Error(error.message)
          alertsRefreshed += 1
        }
      }

      const { data: existingAlerts, error: existingError } = await supabase
        .from('forge_ai_watch_alerts')
        .select('id, dedupe_key, status')
        .eq('organization_id', organizationId)
        .eq('watch_rule_id', rule.id)
        .in('status', ['open','acknowledged'])

      if (existingError) throw new Error(existingError.message)

      const stale = (existingAlerts || []).filter(
        (alert: any) => !activeDedupeKeys.has(alert.dedupe_key)
      )

      if (stale.length) {
        const { error } = await supabase
          .from('forge_ai_watch_alerts')
          .update({
            status: 'resolved',
            resolved_at: now,
            resolved_by: null,
            updated_at: now
          })
          .in('id', stale.map((alert: any) => alert.id))

        if (error) throw new Error(error.message)
        alertsResolved += stale.length
      }
    }

    const completedAt = new Date().toISOString()

    await supabase
      .from('forge_ai_watch_runs')
      .update({
        status: 'completed',
        evaluated_rules: (rules || []).length,
        alerts_created: alertsCreated,
        alerts_refreshed: alertsRefreshed,
        alerts_resolved: alertsResolved,
        completed_at: completedAt
      })
      .eq('id', run.id)

    return {
      runId: run.id,
      evaluatedRules: (rules || []).length,
      alertsCreated,
      alertsRefreshed,
      alertsResolved,
      completedAt
    }
  } catch (error) {
    await supabase
      .from('forge_ai_watch_runs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown Forge AI Watch error',
        completed_at: new Date().toISOString()
      })
      .eq('id', run.id)

    throw error
  }
}
