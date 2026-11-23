'use server'

import { createCapaForSource } from '@/lib/forgeCapaCreate'
import { setVehicleServiceStatus } from '@/lib/forgeFleetAccess'
import { recordScanEvent, scanActor, setAssetServiceStatus } from '@/lib/forgeScanContext'
import {
  ISSUE_CAPA_SEVERITY,
  ISSUE_CAPA_SOURCE_TYPE,
  effectiveIssuePriority,
  isUrgentIssue,
  issueCapaDescription,
  issueDueAt,
  shouldMarkOutOfService,
  validateIssueReport
} from '@/lib/forgeScanIssues'
import { notifyScanIssue } from '@/lib/forgeScanNotify'

import { db, loadReportContext, uploaderIds } from './reportContext'

/**
 * Port slice 10: submit a scan issue report (1.0 reportIssue). Re-resolves the QR, target and viewer from
 * the token, checks report_issue (and out_of_service when tagging out), claims only photo uploads made on
 * this QR by the same reporter, saves forge_qr_issue_reports, opens a Corrective Action (source 'asset'),
 * links it to the asset, tags the asset out of service when asked and allowed, logs the scan and notifies.
 * Port slice 11: vehicle QRs set vehicle_id, link the CAPA to the vehicle (fleet_vehicle), tag the vehicle out
 * of service through forge_fleet_set_status (source qr_issue) and also notify fleet.edit holders. The CAPA is
 * left unassigned for vehicles.
 */

export type IssueReportResult =
  | { ok: false; error: string; errors?: Record<string, string> }
  | {
      ok: true
      reportId: string
      actionNumber: string | null
      correctiveActionId: string | null
      outOfService: boolean
      outOfServiceError: string | null
    }

const CAPA_VIEW = 'corrective_actions.view'

export const submitIssueReport = async (token: string, input: Record<string, unknown>): Promise<IssueReportResult> => {
  const context = await loadReportContext(String(token || ''))

  if (!context) return { ok: false, error: 'This QR code is not active.' }

  const { qr, target, viewer, canReport, canMarkOutOfService } = context

  if (!canReport) return { ok: false, error: 'Enter your employee number or sign in to report an issue here.' }

  const parsed = validateIssueReport(input || {}, { targetName: target.name })

  if (!parsed.ok) return { ok: false, error: 'Check the highlighted fields.', errors: parsed.errors }

  const value = parsed.value
  const supabase = db()
  const uploader = uploaderIds(viewer)
  const anonymous = viewer.kind === 'anonymous'
  const reporterName = anonymous ? value.reporterName : viewer.name

  const markOutOfService = shouldMarkOutOfService({
    targetType: target.type,
    viewerMayMarkOutOfService: canMarkOutOfService,
    requested: value.outOfService,
    immediateHazard: value.immediateHazard
  })

  // Photos: only unused uploads made on this QR by this same reporter.
  let photos: { path: string; name: string; type: string; size: number }[] = []

  if (value.uploadIds.length) {
    let query = supabase
      .from('forge_qr_issue_uploads')
      .select('id, storage_path, file_name, content_type, size_bytes')
      .eq('organization_id', qr.organizationId)
      .eq('qr_code_id', qr.id)
      .is('report_id', null)
      .in('id', value.uploadIds)

    query = uploader.userId ? query.eq('uploader_user_id', uploader.userId) : query.is('uploader_user_id', null)
    query = uploader.personnelId ? query.eq('uploader_personnel_id', uploader.personnelId) : query.is('uploader_personnel_id', null)

    const { data: uploads } = await query

    if ((uploads || []).length !== value.uploadIds.length) {
      return { ok: false, error: 'A photo could not be attached. Remove it and add it again.', errors: { photos: 'A photo could not be attached.' } }
    }

    const byId = new Map<string, any>((uploads || []).map((row: any) => [row.id, row]))

    photos = value.uploadIds.map(id => {
      const row = byId.get(id)

      return { path: row.storage_path, name: row.file_name, type: row.content_type, size: row.size_bytes }
    })
  }

  const asset =
    target.type === 'asset'
      ? (
          await supabase
            .from('forge_assets')
            .select('id, location_id, division_id, custodian_personnel_id, custodian_user_id')
            .eq('organization_id', qr.organizationId)
            .eq('id', target.id)
            .maybeSingle()
        ).data
      : null

  const vehicle =
    target.type === 'vehicle'
      ? { id: target.id, location_id: target.locationId, division_id: target.divisionId, assigned_driver_personnel_id: target.assignedDriverPersonnelId }
      : null

  const locationId = target.type === 'asset' || target.type === 'vehicle' || target.type === 'location' || target.type === 'area' ? target.locationId : null
  const divisionId = target.type === 'asset' || target.type === 'vehicle' || target.type === 'area' ? target.divisionId : null
  const noun = vehicle ? 'vehicle' : 'equipment'

  const { data: report, error: reportError } = await supabase
    .from('forge_qr_issue_reports')
    .insert({
      organization_id: qr.organizationId,
      qr_code_id: qr.id,
      target_type: target.type,
      target_id: target.id,
      asset_id: target.type === 'asset' ? target.id : null,
      vehicle_id: vehicle ? vehicle.id : null,
      area_id: target.type === 'area' ? target.id : null,
      location_id: locationId,
      title: value.title,
      description: value.description,
      priority: value.priority,
      category: value.category,
      immediate_hazard: value.immediateHazard,
      marked_out_of_service: false,
      anonymous,
      reporter_name: reporterName,
      reporter_personnel_id: uploader.personnelId,
      reporter_user_id: uploader.userId,
      photos
    })
    .select('id')
    .single()

  if (reportError || !report) {
    await recordScanEvent({ qr, action: 'report_issue', viewer, result: 'failed', metadata: { error: reportError?.message || 'insert failed' } })

    return { ok: false, error: 'Unable to save the report. Try again.' }
  }

  if (value.uploadIds.length) {
    await supabase.from('forge_qr_issue_uploads').update({ report_id: report.id }).eq('qr_code_id', qr.id).is('report_id', null).in('id', value.uploadIds)
  }

  // Corrective Action
  const priority = effectiveIssuePriority(value.priority, value.immediateHazard)
  const reporterLabel = reporterName ? reporterName + (anonymous ? ' (not identified)' : '') : 'an anonymous scanner'

  const capa = await createCapaForSource({
    organizationId: qr.organizationId,
    actorUserId: uploader.userId,
    source: { type: ISSUE_CAPA_SOURCE_TYPE, id: report.id, reference: `${qr.qrNumber} scan issue` },
    values: {
      title: value.title,
      description: issueCapaDescription({
        description: value.description,
        qrNumber: qr.qrNumber,
        targetName: target.name,
        reportId: report.id,
        category: value.category,
        immediateHazard: value.immediateHazard,
        reporter: reporterLabel,
        outOfService: markOutOfService,
        photoCount: photos.length,
        noun
      }),
      action_type: 'corrective',
      severity: ISSUE_CAPA_SEVERITY[priority],
      location_id: locationId,
      division_id: divisionId,
      due_at: issueDueAt(priority),
      immediate_containment: markOutOfService ? (vehicle ? 'Vehicle marked out of service from the scan.' : 'Equipment marked out of service from the scan.') : null,
      assigned_personnel_id: asset?.custodian_personnel_id || null
    },
    createdMessage: `Corrective Action opened from a scan of QR ${qr.qrNumber}`
  })

  const capaId = 'error' in capa ? null : capa.id
  const actionNumber = 'error' in capa ? null : capa.actionNumber

  if ('error' in capa) console.error('[scan] issue CAPA', report.id, capa.error)

  if (capaId) {
    await supabase.from('forge_qr_issue_reports').update({ corrective_action_id: capaId }).eq('id', report.id).eq('organization_id', qr.organizationId)

    if (target.type === 'asset' || vehicle) {
      const { error } = await supabase.from('forge_record_links').insert({
        organization_id: qr.organizationId,
        source_resource_type: 'corrective_action',
        source_resource_id: capaId,
        target_resource_type: vehicle ? 'fleet_vehicle' : 'asset',
        target_resource_id: target.id,
        relationship_type: 'equipment',
        created_by: uploader.userId
      })

      if (error && error.code !== '23505') console.error('[scan] issue CAPA target link', report.id, error.message)
    }
  }

  // Out of service
  let outOfService = false
  let outOfServiceError: string | null = null

  if (markOutOfService && vehicle) {
    const actor = scanActor(viewer)

    const changed = await setVehicleServiceStatus({
      organizationId: qr.organizationId,
      vehicleId: vehicle.id,
      status: 'out_of_service',
      reason: value.title,
      source: 'qr_issue',
      relatedRecordType: 'qr_issue_report',
      relatedRecordId: report.id,
      qrCodeId: qr.id,
      actorUserId: actor.userId,
      actorPersonnelId: actor.personnelId,
      actorName: actor.name
    })

    if ('error' in changed) {
      outOfServiceError = 'The report was saved, but the vehicle could not be marked out of service. Tag it out by hand and tell your supervisor.'
      console.error('[scan] issue vehicle out of service', report.id, changed.error)
    } else {
      outOfService = true
      await supabase.from('forge_qr_issue_reports').update({ marked_out_of_service: true }).eq('id', report.id).eq('organization_id', qr.organizationId)

      if (changed.changed) {
        await recordScanEvent({ qr, action: 'out_of_service', viewer, recordType: 'vehicle', recordId: vehicle.id, metadata: { source: 'qr_issue', reason: value.title } })
      }
    }
  }

  if (markOutOfService && target.type === 'asset') {
    const changed = await setAssetServiceStatus({
      qr,
      assetId: target.id,
      status: 'out_of_service',
      viewer,
      reason: value.title,
      notes: value.description.slice(0, 1000),
      source: 'qr_issue',
      relatedRecordType: 'qr_issue_report',
      relatedRecordId: report.id
    })

    if ('error' in changed) {
      outOfServiceError = 'The report was saved, but the equipment could not be marked out of service. Tag it out by hand and tell your supervisor.'
      console.error('[scan] issue out of service', report.id, changed.error)
    } else {
      outOfService = true
      await supabase.from('forge_qr_issue_reports').update({ marked_out_of_service: true }).eq('id', report.id).eq('organization_id', qr.organizationId)
    }
  }

  await recordScanEvent({
    qr,
    action: 'report_issue',
    viewer,
    recordType: capaId ? 'corrective_action' : 'qr_issue_report',
    recordId: capaId || report.id,
    metadata: { report_id: report.id, priority: value.priority, immediate_hazard: value.immediateHazard, out_of_service: outOfService, photos: photos.length }
  })

  await notifyScanIssue({
    organizationId: qr.organizationId,
    reportId: report.id,
    correctiveActionId: capaId,
    actionNumber,
    title: value.title,
    targetName: target.name,
    qrNumber: qr.qrNumber,
    priority,
    urgent: isUrgentIssue(value.priority, value.immediateHazard),
    outOfService,
    locationId,
    divisionId,
    custodianUserId: asset?.custodian_user_id || null,
    custodianPersonnelId: asset?.custodian_personnel_id || null,
    actorUserId: uploader.userId,
    vehicle
  })

  return { ok: true, reportId: report.id, actionNumber, correctiveActionId: viewer.kind === 'user' && viewer.permissions.includes(CAPA_VIEW) ? capaId : null, outOfService, outOfServiceError }
}
