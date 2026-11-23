import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { createCapasForInspectionFindings } from '@/lib/forgeInspectionCapa'
import { INSPECTION_FINDING_CAPA_SOURCE } from '@/lib/forgeInspectionCapaRules'
import { inspectionWithinScope } from '@/lib/forgeInspections'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import type { ScanQr, ScanTarget } from '@/lib/forgeScanContext'
import { recordScanEvent, scanActor, setAssetServiceStatus } from '@/lib/forgeScanContext'
import type { ScanAnswer, ScanChecklistItem } from '@/lib/forgeScanInspectionRules'
import {
  SCAN_UNFINISHED_STATUSES,
  findingItems,
  normalizeScanAnswer,
  scanFindingDescription,
  scanFindingTitle,
  scanInspectionDate,
  scanInspectionResult,
  validateScanAnswers
} from '@/lib/forgeScanInspectionRules'
import type { ScanAction, ScanFrequency, ScanViewer } from '@/lib/forgeScanRules'
import { SCAN_FREQUENCIES, buildScanActions, canUseScanAction, scanInspectionTitle } from '@/lib/forgeScanRules'

/**
 * Port slice 10: inspections started from a QR scan (/scan/<token>/inspect/<frequency>). Server only.
 *
 * The template comes only from the QR's action config (never the browser). A signed-in member with
 * inspections.create gets a normal inspection and continues on /inspections/<id>; an employee identified by
 * number gets the same inspection with themselves as inspector and runs it on the mobile runner. Completing
 * re-checks that the inspection belongs to this QR and company, was started by the same person and is still
 * unfinished (1.0 did not), then writes findings, a CAPA per finding, the submit, and (when the QR says so)
 * takes the equipment out of service.
 */

const db = () => createServiceRoleClient() as any

export const isScanFrequency = (value: string): value is ScanFrequency => (SCAN_FREQUENCIES as readonly string[]).includes(value)

export type ScanInspectionTemplate = { id: string; name: string; version: number; items: any[] }

/** The active template the QR's config names for this frequency, in the QR's company. */
export const loadScanInspectionTemplate = async (qr: ScanQr, frequency: ScanFrequency): Promise<ScanInspectionTemplate | null> => {
  const templateId = qr.config.inspectionTemplates[frequency]

  if (!templateId) return null

  const { data } = await db()
    .from('forge_inspection_templates')
    .select('id, name, version, forge_inspection_template_items(*)')
    .eq('organization_id', qr.organizationId)
    .eq('id', templateId)
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    version: data.version,
    items: (data.forge_inspection_template_items || []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order)
  }
}

/** The menu action for this frequency, when the QR offers it (template configured, target not retired). */
export const scanInspectionAction = (qr: ScanQr, target: ScanTarget, frequency: ScanFrequency): ScanAction | null =>
  buildScanActions({
    targetType: qr.targetType,
    targetId: qr.targetId,
    token: qr.token,
    accessMode: qr.accessMode,
    config: qr.config,
    assetStatus: target.type === 'asset' ? target.status : null
  }).find(action => action.id === `inspect_${frequency}`) || null

export const canStartScanInspection = (qr: ScanQr, target: ScanTarget, viewer: ScanViewer, frequency: ScanFrequency) => {
  const action = scanInspectionAction(qr, target, frequency)

  return Boolean(action && canUseScanAction(action, viewer, qr.accessMode, qr.config))
}

/** Location and division for the inspection: the asset's location, or the location the QR points at. */
export const scanInspectionPlace = (target: ScanTarget): { locationId: string; divisionId: string | null } | { error: string } => {
  if (target.type === 'asset') {
    if (!target.locationId) return { error: 'This equipment has no location in Forge, so an inspection cannot be started. Ask your supervisor to set its location.' }

    return { locationId: target.locationId, divisionId: target.divisionId }
  }

  if (target.type === 'location') return { locationId: target.locationId, divisionId: null }
  if (target.type === 'area') return { locationId: target.locationId, divisionId: target.divisionId }

  return { error: 'Inspections cannot be started from a form QR code.' }
}

const writeActivity = async (
  supabase: any,
  {
    organizationId,
    inspectionId,
    actorUserId,
    activityType,
    message,
    metadata = {}
  }: { organizationId: string; inspectionId: string; actorUserId: string | null; activityType: string; message: string; metadata?: Record<string, unknown> }
) => {
  await supabase.from('forge_inspection_activity').insert({
    organization_id: organizationId,
    inspection_id: inspectionId,
    activity_type: activityType,
    message,
    actor_user_id: actorUserId,
    metadata
  })
}

const writeAudit = async (supabase: any, { actorUserId, organizationId, action, entityType, entityId, before, after }: any) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

const scanMeta = (qr: ScanQr, viewer: ScanViewer, frequency: string | null) => {
  const actor = scanActor(viewer)

  return { source: 'qr_scan', qr_code_id: qr.id, qr_number: qr.qrNumber, frequency, actor_personnel_id: actor.personnelId, actor_name: actor.name, viewer: viewer.kind }
}

/** The person's unfinished scan inspection for this QR and frequency, started today. */
/** Today's unfinished scan inspection for this viewer, QR and frequency, or null. Read only. */
export const findResumableScanInspection = async (qr: ScanQr, viewer: ScanViewer, frequency: ScanFrequency) => {
  let query = db()
    .from('forge_inspections')
    .select('id')
    .eq('organization_id', qr.organizationId)
    .eq('qr_code_id', qr.id)
    .eq('inspection_frequency', frequency)
    .eq('inspection_date', scanInspectionDate())
    .in('status', [...SCAN_UNFINISHED_STATUSES])

  if (viewer.kind === 'employee') query = query.eq('inspector_personnel_id', viewer.personnelId).is('inspector_user_id', null)
  else if (viewer.kind === 'user') query = query.eq('inspector_user_id', viewer.userId)
  else return null

  const { data } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

  return (data?.id as string) || null
}

export type StartScanInspectionResult = { inspectionId: string; resumed: boolean } | { error: string }

/**
 * Starts (or resumes today's unfinished) inspection for this QR and frequency. The caller has loaded the QR,
 * target and viewer; the action and the template are checked again here.
 */
export const startScanInspection = async ({
  qr,
  target,
  viewer,
  frequency
}: {
  qr: ScanQr
  target: ScanTarget
  viewer: ScanViewer
  frequency: ScanFrequency
}): Promise<StartScanInspectionResult> => {
  if (viewer.kind === 'anonymous' || !canStartScanInspection(qr, target, viewer, frequency)) return { error: 'You cannot start this inspection.' }

  const template = await loadScanInspectionTemplate(qr, frequency)

  if (!template) return { error: 'This inspection is not set up for this QR code.' }

  const place = scanInspectionPlace(target)

  if ('error' in place) return place

  const supabase = db()
  const userId = viewer.kind === 'user' ? viewer.userId : null

  if (viewer.kind === 'user') {
    const access = await getEffectiveTenantAccess({ organizationId: qr.organizationId, userId: viewer.userId })
    const permission = access.effective.find(item => item.permissionKey === 'inspections.create' && item.allowed)

    const allowed =
      permission &&
      (await inspectionWithinScope({
        organizationId: qr.organizationId,
        userId: viewer.userId,
        scope: permission.scope,
        inspection: { organization_id: qr.organizationId, inspector_user_id: viewer.userId, location_id: place.locationId, division_id: place.divisionId }
      }))

    if (!allowed) return { error: 'Starting an inspection here is outside your access.' }
  }

  const resumable = await findResumableScanInspection(qr, viewer, frequency)

  if (resumable) return { inspectionId: resumable, resumed: true }

  const { data: inspectionNumber, error: numberError } = await supabase.rpc('next_forge_inspection_number', { p_organization_id: qr.organizationId })

  if (numberError || !inspectionNumber) return { error: 'Unable to start the inspection right now.' }

  const now = new Date().toISOString()
  const employee = viewer.kind === 'employee'

  const { data: inspection, error } = await supabase
    .from('forge_inspections')
    .insert({
      organization_id: qr.organizationId,
      inspection_number: inspectionNumber,
      template_id: template.id,
      template_name_snapshot: template.name,
      template_version_snapshot: template.version,

      // An employee starts answering straight away on the runner; a signed-in user lands on the normal page.
      status: employee ? 'in_progress' : 'draft',
      started_at: employee ? now : null,
      inspection_date: scanInspectionDate(),
      location_id: place.locationId,
      division_id: place.divisionId,
      inspector_user_id: userId,
      inspector_personnel_id: viewer.personnelId,
      notes: scanInspectionTitle(target.name, frequency),
      qr_code_id: qr.id,
      asset_id: target.type === 'asset' ? target.id : null,
      inspection_frequency: frequency,
      created_by: userId,
      updated_by: userId
    })
    .select('*')
    .single()

  if (error || !inspection) return { error: 'Unable to start the inspection right now.' }

  if (template.items.length) {
    const { error: itemsError } = await supabase.from('forge_inspection_items').insert(
      template.items.map((item: any) => ({
        organization_id: qr.organizationId,
        inspection_id: inspection.id,
        template_item_id: item.id,
        item_key: item.item_key,
        section_key: item.section_key,
        section_label: item.section_label,
        prompt: item.prompt,
        guidance: item.guidance,
        response_type: item.response_type,
        sort_order: item.sort_order,
        is_required: item.is_required,
        finding_on: item.finding_on
      }))
    )

    if (itemsError) {
      await supabase.from('forge_inspections').delete().eq('id', inspection.id)

      return { error: 'Unable to start the inspection right now.' }
    }
  }

  if (target.type === 'asset') {
    const { error: linkError } = await supabase.from('forge_record_links').insert({
      organization_id: qr.organizationId,
      source_resource_type: 'inspection',
      source_resource_id: inspection.id,
      target_resource_type: 'asset',
      target_resource_id: target.id,
      relationship_type: 'involves_asset',
      created_by: userId
    })

    if (linkError && linkError.code !== '23505') console.error('Scan inspection asset link failed', linkError)
  }

  const meta = scanMeta(qr, viewer, frequency)

  await writeActivity(supabase, {
    organizationId: qr.organizationId,
    inspectionId: inspection.id,
    actorUserId: userId,
    activityType: 'created',
    message: `Inspection started from QR ${qr.qrNumber} (${frequency}) using template ${template.name}${viewer.kind === 'employee' ? ` by ${viewer.name}` : ''}.`,
    metadata: meta
  })

  await writeAudit(supabase, {
    actorUserId: userId,
    organizationId: qr.organizationId,
    action: 'inspection.created',
    entityType: 'inspection',
    entityId: inspection.id,
    after: inspection
  })

  await recordScanEvent({ qr, action: 'inspection_start', viewer, recordType: 'inspection', recordId: inspection.id, metadata: { frequency, template_id: template.id } })

  return { inspectionId: inspection.id, resumed: false }
}

export type ScanRunnerInspection = {
  id: string
  number: string
  status: string
  frequency: string
  templateName: string | null
  items: (ScanChecklistItem & { item_key: string; section_label: string; guidance: string | null; response_value: string | null; notes: string | null })[]
}

/**
 * The employee's inspection on this QR, with its checklist. Null unless it belongs to this QR and company and
 * was started by this same person (and, unless `allowFinished`, is still unfinished).
 */
export const loadEmployeeScanInspection = async ({
  qr,
  viewer,
  inspectionId,
  allowFinished = false
}: {
  qr: ScanQr
  viewer: ScanViewer
  inspectionId: string
  allowFinished?: boolean
}): Promise<(ScanRunnerInspection & { raw: any }) | null> => {
  if (viewer.kind !== 'employee' || !/^[0-9a-f-]{36}$/i.test(inspectionId || '')) return null

  const supabase = db()

  const [{ data: inspection }, { data: items }] = await Promise.all([
    supabase
      .from('forge_inspections')
      .select('*')
      .eq('organization_id', qr.organizationId)
      .eq('id', inspectionId)
      .eq('qr_code_id', qr.id)
      .eq('inspector_personnel_id', viewer.personnelId)
      .is('inspector_user_id', null)
      .maybeSingle(),
    supabase
      .from('forge_inspection_items')
      .select('id, item_key, section_label, prompt, guidance, response_type, sort_order, is_required, finding_on, response_value, notes')
      .eq('organization_id', qr.organizationId)
      .eq('inspection_id', inspectionId)
      .order('sort_order', { ascending: true })
  ])

  if (!inspection) return null
  if (!allowFinished && !(SCAN_UNFINISHED_STATUSES as readonly string[]).includes(inspection.status)) return null

  return {
    id: inspection.id,
    number: inspection.inspection_number,
    status: inspection.status,
    frequency: inspection.inspection_frequency,
    templateName: inspection.template_name_snapshot,
    items: items || [],
    raw: inspection
  }
}

/** Saves one checklist answer for an employee's scan inspection. */
export const saveEmployeeScanAnswer = async ({
  qr,
  viewer,
  inspectionId,
  itemId,
  value,
  notes
}: {
  qr: ScanQr
  viewer: ScanViewer
  inspectionId: string
  itemId: string
  value: unknown
  notes: unknown
}): Promise<{ ok: true } | { error: string }> => {
  const inspection = await loadEmployeeScanInspection({ qr, viewer, inspectionId })

  if (!inspection) return { error: 'This inspection is no longer open.' }

  const item = inspection.items.find(entry => entry.id === itemId)

  if (!item) return { error: 'Checklist item not found.' }

  const normalized = normalizeScanAnswer(item.response_type, value)

  if ('error' in normalized) return normalized

  const note = typeof notes === 'string' ? notes.trim().slice(0, 2000) : ''
  const supabase = db()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('forge_inspection_items')
    .update({ response_value: normalized.value, notes: note || null, responded_by: null, responded_at: normalized.value ? now : null })
    .eq('organization_id', qr.organizationId)
    .eq('inspection_id', inspection.id)
    .eq('id', item.id)

  if (error) return { error: 'Unable to save that answer.' }

  if (inspection.status === 'draft') {
    await supabase
      .from('forge_inspections')
      .update({ status: 'in_progress', started_at: inspection.raw.started_at || now, updated_at: now })
      .eq('id', inspection.id)
      .eq('status', 'draft')
  } else {
    await supabase.from('forge_inspections').update({ updated_at: now }).eq('id', inspection.id)
  }

  return { ok: true }
}

export type CompleteScanInspectionResult = { ok: true; inspectionId: string } | { error: string; itemErrors?: Record<string, string> }

/**
 * Completes an employee's scan inspection: saves the answers, submits it, raises a finding per answer that
 * matches finding_on, opens a CAPA per finding and, when the QR says so, takes the asset out of service.
 */
export const completeEmployeeScanInspection = async ({
  qr,
  target,
  viewer,
  inspectionId,
  answers
}: {
  qr: ScanQr
  target: ScanTarget
  viewer: ScanViewer
  inspectionId: string
  answers: Record<string, ScanAnswer>
}): Promise<CompleteScanInspectionResult> => {
  const inspection = await loadEmployeeScanInspection({ qr, viewer, inspectionId })

  if (!inspection || viewer.kind !== 'employee') return { error: 'This inspection is no longer open.' }

  const frequency = inspection.frequency

  if (!isScanFrequency(frequency) || !canStartScanInspection(qr, target, viewer, frequency)) return { error: 'You cannot complete this inspection.' }

  // Answers sent now win; anything not sent keeps what was saved item by item.
  const merged: Record<string, ScanAnswer> = {}

  for (const item of inspection.items) {
    const sent = answers && typeof answers === 'object' ? answers[item.id] : undefined

    merged[item.id] = sent
      ? { value: typeof sent.value === 'string' ? sent.value : null, notes: typeof sent.notes === 'string' ? sent.notes : null }
      : { value: item.response_value, notes: item.notes }
  }

  const itemErrors = validateScanAnswers(inspection.items, merged)

  if (Object.keys(itemErrors).length) {
    return { error: `${Object.keys(itemErrors).length} item(s) need attention before you can finish.`, itemErrors }
  }

  const supabase = db()
  const now = new Date().toISOString()

  for (const item of inspection.items) {
    const normalized = normalizeScanAnswer(item.response_type, merged[item.id].value)
    const value = 'value' in normalized ? normalized.value : null
    const notes = (merged[item.id].notes || '').trim() || null

    if (value === item.response_value && notes === (item.notes || null)) continue

    await supabase
      .from('forge_inspection_items')
      .update({ response_value: value, notes, responded_by: null, responded_at: value ? now : null })
      .eq('organization_id', qr.organizationId)
      .eq('inspection_id', inspection.id)
      .eq('id', item.id)
  }

  const result = scanInspectionResult(inspection.items, merged)

  // Claim the submit: only one completion wins, and only while the inspection is still unfinished.
  const { data: after, error: submitError } = await supabase
    .from('forge_inspections')
    .update({
      status: 'submitted',
      result,
      started_at: inspection.raw.started_at || now,
      completed_at: now,
      submitted_at: now,
      submitted_by: null,
      returned_at: null,
      returned_by: null,
      return_reason: null,
      updated_by: null,
      updated_at: now
    })
    .eq('organization_id', qr.organizationId)
    .eq('id', inspection.id)
    .eq('qr_code_id', qr.id)
    .eq('inspector_personnel_id', viewer.personnelId)
    .in('status', [...SCAN_UNFINISHED_STATUSES])
    .select('*')
    .maybeSingle()

  if (submitError || !after) return { error: 'This inspection was already completed.' }

  const meta = scanMeta(qr, viewer, frequency)
  const severityLookup = await getEffectiveLookup({ organizationId: qr.organizationId, lookupKey: 'inspections.finding_severity' })
  const severityKeys = severityLookup.options.map(option => option.key)
  const severity = severityKeys.includes('moderate') ? 'moderate' : severityKeys[0] || 'moderate'

  const { data: existingFindings } = await supabase
    .from('forge_inspection_findings')
    .select('inspection_item_id')
    .eq('organization_id', qr.organizationId)
    .eq('inspection_id', inspection.id)

  const alreadyRaised = new Set((existingFindings || []).map((row: any) => row.inspection_item_id))
  const findings: any[] = []

  for (const item of findingItems(inspection.items, merged)) {
    if (alreadyRaised.has(item.id)) continue

    const normalized = normalizeScanAnswer(item.response_type, merged[item.id].value)
    const answer = 'value' in normalized && normalized.value ? normalized.value : ''

    const { data: finding, error } = await supabase
      .from('forge_inspection_findings')
      .insert({
        organization_id: qr.organizationId,
        inspection_id: inspection.id,
        inspection_item_id: item.id,
        title: scanFindingTitle(item.prompt),
        description: scanFindingDescription(answer, merged[item.id].notes, viewer.name),
        severity,
        status: 'open',
        created_by: null,
        updated_by: null
      })
      .select('*')
      .single()

    if (error || !finding) {
      console.error('Scan inspection finding failed', inspection.id, error)
      continue
    }

    findings.push(finding)

    await writeActivity(supabase, {
      organizationId: qr.organizationId,
      inspectionId: inspection.id,
      actorUserId: null,
      activityType: 'finding_created',
      message: 'Finding created: ' + finding.title,
      metadata: { ...meta, finding_id: finding.id, severity: finding.severity }
    })
  }

  await writeActivity(supabase, {
    organizationId: qr.organizationId,
    inspectionId: inspection.id,
    actorUserId: null,
    activityType: 'submitted',
    message: `Inspection completed from QR ${qr.qrNumber} by ${viewer.name}.`,
    metadata: { ...meta, result, findings: findings.length }
  })

  await writeAudit(supabase, {
    actorUserId: null,
    organizationId: qr.organizationId,
    action: 'inspection.submitted',
    entityType: 'inspection',
    entityId: inspection.id,
    before: inspection.raw,
    after
  })

  const capas = await createCapasForInspectionFindings({ organizationId: qr.organizationId, actorUserId: null, inspection: after })

  if (capas.errors.length) console.error('Scan inspection CAPA creation failed', inspection.id, capas.errors)

  let outOfService = false

  if (findings.length && qr.config.outOfServiceOnFailedInspection && target.type === 'asset') {
    const status = await setAssetServiceStatus({
      qr,
      assetId: target.id,
      status: 'out_of_service',
      viewer,
      reason: `Failed ${frequency} inspection ${inspection.number}`,
      notes: findings.map(finding => finding.title).join('; ').slice(0, 1000),
      source: 'qr_inspection',
      relatedRecordType: 'inspection',
      relatedRecordId: inspection.id
    })

    if ('error' in status) console.error('Scan inspection out of service failed', inspection.id, status.error)
    else outOfService = status.changed
  }

  await recordScanEvent({
    qr,
    action: 'inspection_complete',
    viewer,
    recordType: 'inspection',
    recordId: inspection.id,
    metadata: { frequency, result, findings: findings.length, capas: capas.created, out_of_service: outOfService }
  })

  return { ok: true, inspectionId: inspection.id }
}

export type ScanInspectionSummary = {
  number: string
  result: string | null
  status: string
  findings: { id: string; title: string }[]
  capaNumbers: string[]
  outOfService: boolean
  assetOutOfServiceNow: boolean
}

/** What the result screen shows for a completed scan inspection. */
export const loadScanInspectionSummary = async ({
  qr,
  viewer,
  inspectionId
}: {
  qr: ScanQr
  viewer: ScanViewer
  inspectionId: string
}): Promise<ScanInspectionSummary | null> => {
  const inspection = await loadEmployeeScanInspection({ qr, viewer, inspectionId, allowFinished: true })

  if (!inspection || (SCAN_UNFINISHED_STATUSES as readonly string[]).includes(inspection.status)) return null

  const supabase = db()

  const { data: findings } = await supabase
    .from('forge_inspection_findings')
    .select('id, title')
    .eq('organization_id', qr.organizationId)
    .eq('inspection_id', inspection.id)
    .order('created_at', { ascending: true })

  const findingIds = (findings || []).map((finding: any) => finding.id)

  const [{ data: capas }, { data: history }, { data: asset }] = await Promise.all([
    findingIds.length
      ? supabase
          .from('forge_corrective_actions')
          .select('action_number')
          .eq('organization_id', qr.organizationId)
          .eq('source_type', INSPECTION_FINDING_CAPA_SOURCE)
          .in('source_id', findingIds)
          .is('archived_at', null)
          .order('action_number', { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from('forge_asset_status_history')
      .select('id')
      .eq('organization_id', qr.organizationId)
      .eq('related_record_type', 'inspection')
      .eq('related_record_id', inspection.id)
      .eq('to_status', 'out_of_service')
      .limit(1),
    inspection.raw.asset_id
      ? supabase.from('forge_assets').select('status').eq('organization_id', qr.organizationId).eq('id', inspection.raw.asset_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])

  return {
    number: inspection.number,
    result: inspection.raw.result,
    status: inspection.status,
    findings: findings || [],
    capaNumbers: (capas || []).map((capa: any) => capa.action_number),
    outOfService: Boolean((history || []).length),
    assetOutOfServiceNow: asset?.status === 'out_of_service'
  }
}

/** "Started from QR …" details for the signed-in inspection page. Null for inspections not started by a scan. */
export const loadScanInspectionOrigin = async ({ organizationId, inspection }: { organizationId: string; inspection: any }) => {
  if (!inspection?.qr_code_id) return null

  const supabase = db()

  const [{ data: qr }, { data: asset }] = await Promise.all([
    supabase.from('forge_qr_codes').select('qr_number').eq('organization_id', organizationId).eq('id', inspection.qr_code_id).maybeSingle(),
    inspection.asset_id
      ? supabase.from('forge_assets').select('id, name, asset_number').eq('organization_id', organizationId).eq('id', inspection.asset_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])

  return {
    qrNumber: (qr?.qr_number as string) || null,
    frequency: (inspection.inspection_frequency as string) || null,
    asset: asset ? { id: asset.id as string, name: asset.asset_number ? `${asset.name} (${asset.asset_number})` : (asset.name as string) } : null
  }
}
