import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { incidentWithinScope } from '@/lib/forgeIncidents'
import { inspectionWithinScope, getInspectionDetailData } from '@/lib/forgeInspections'
import { assetWithinScope, getAssetDetailData } from '@/lib/forgeAssets'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { qrCodeWithinScope } from '@/lib/forgeQr'
import { getTrainingOverview } from '@/lib/forgeTraining'
import { getLotoProcedureDetail, lotoProcedureWithinScope } from '@/lib/forgeLoto'

export type ForgeAiRecordContextRequest = {
  type: 'incident' | 'inspection' | 'asset' | 'personnel' | 'training_course' | 'qr' | 'loto'
  id: string
}

type ContextBase = {
  type: 'incident' | 'inspection' | 'asset' | 'personnel' | 'training_course' | 'qr' | 'loto'
  id: string
  humanReference: string
  title: string
  data: Record<string, unknown>
}

const permissionFor = (
  permissionByKey: Map<string, EffectivePermission>,
  key: string
) => {
  const permission = permissionByKey.get(key)
  return permission?.allowed ? permission : null
}

export const getForgeAiRecordContext = async ({
  organizationId,
  userId,
  request,
  permissionByKey
}: {
  organizationId: string
  userId: string
  request: ForgeAiRecordContextRequest
  permissionByKey: Map<string, EffectivePermission>
}): Promise<ContextBase | null> => {
  const supabase = createServiceRoleClient() as any

  if (request.type === 'incident') {
    const permission = permissionFor(permissionByKey, 'incidents.view')
    if (!permission) return null

    const { data: incident } = await supabase
      .from('forge_incidents')
      .select('*, locations(name, code), divisions(name, code)')
      .eq('organization_id', organizationId)
      .eq('id', request.id)
      .maybeSingle()

    if (!incident) return null

    const allowed = await incidentWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      incident
    })

    if (!allowed) return null

    return {
      type: 'incident',
      id: incident.id,
      humanReference: incident.incident_number,
      title: incident.summary || incident.incident_number,
      data: {
        incident_number: incident.incident_number,
        status: incident.status,
        incident_type: incident.incident_type,
        severity: incident.severity,
        occurred_at: incident.occurred_at,
        location: incident.locations?.name || null,
        division: incident.divisions?.name || null,
        summary: incident.summary,
        description: incident.description,
        immediate_actions: incident.immediate_actions,
        involves_injury: incident.involves_injury,
        involves_vehicle: incident.involves_vehicle,
        property_damage: incident.property_damage,
        submitted_at: incident.submitted_at,
        approved_at: incident.approved_at,
        closed_at: incident.closed_at
      }
    }
  }

  if (request.type === 'inspection') {
    const permission = permissionFor(permissionByKey, 'inspections.view')
    if (!permission) return null

    const { data: inspection } = await supabase
      .from('forge_inspections')
      .select('*, locations(name, code), divisions(name, code), forge_inspection_templates(name, inspection_type, version)')
      .eq('organization_id', organizationId)
      .eq('id', request.id)
      .maybeSingle()

    if (!inspection) return null

    const allowed = await inspectionWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      inspection
    })

    if (!allowed) return null

    const detail = await getInspectionDetailData({
      organizationId,
      inspectionId: inspection.id
    })

    return {
      type: 'inspection',
      id: inspection.id,
      humanReference: inspection.inspection_number,
      title: inspection.template_name_snapshot || inspection.forge_inspection_templates?.name || inspection.inspection_number,
      data: {
        inspection_number: inspection.inspection_number,
        status: inspection.status,
        result: inspection.result,
        inspection_date: inspection.inspection_date,
        template: inspection.template_name_snapshot || inspection.forge_inspection_templates?.name || null,
        inspection_type: inspection.forge_inspection_templates?.inspection_type || null,
        location: inspection.locations?.name || null,
        division: inspection.divisions?.name || null,
        notes: inspection.notes,
        return_reason: inspection.return_reason,
        checklist: detail.items.slice(0, 100).map((item: any) => ({
          section: item.section_label,
          prompt: item.prompt,
          response: item.response_value,
          notes: item.notes
        })),
        findings: detail.findings.slice(0, 50).map((finding: any) => ({
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          status: finding.status,
          due_date: finding.due_date,
          corrective_action: finding.corrective_action,
          verification_notes: finding.verification_notes
        }))
      }
    }
  }

  if (request.type === 'asset') {
    const permission = permissionFor(permissionByKey, 'assets_equipment.view')
    if (!permission) return null

    const { data: asset } = await supabase
      .from('forge_assets')
      .select('*, locations(name, code), divisions(name, code), forge_personnel!forge_assets_custodian_personnel_id_fkey(first_name, last_name, employee_number)')
      .eq('organization_id', organizationId)
      .eq('id', request.id)
      .maybeSingle()

    if (!asset) return null

    const allowed = await assetWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      asset
    })

    if (!allowed) return null

    const detail = await getAssetDetailData({
      organizationId,
      assetId: asset.id
    })

    return {
      type: 'asset',
      id: asset.id,
      humanReference: asset.asset_number,
      title: asset.name,
      data: {
        asset_number: asset.asset_number,
        name: asset.name,
        type: asset.asset_type,
        status: asset.status,
        condition: asset.condition,
        criticality: asset.criticality,
        manufacturer: asset.manufacturer,
        model: asset.model,
        serial_number: asset.serial_number,
        location: asset.locations?.name || null,
        division: asset.divisions?.name || null,
        custodian: asset.forge_personnel
          ? [asset.forge_personnel.first_name, asset.forge_personnel.last_name].filter(Boolean).join(' ')
          : null,
        in_service_date: asset.in_service_date,
        warranty_expires_on: asset.warranty_expires_on,
        retired_at: asset.retired_at,
        retirement_reason: asset.retirement_reason,
        maintenance: detail.maintenance.slice(0, 30).map((item: any) => ({
          maintenance_type: item.maintenance_type,
          status: item.status,
          performed_on: item.performed_on,
          scheduled_for: item.scheduled_for,
          description: item.description,
          findings: item.findings,
          corrective_action: item.corrective_action,
          next_due_date: item.next_due_date
        })),
        latest_meter_readings: detail.meterReadings.slice(0, 20).map((item: any) => ({
          meter_type: item.meter_type,
          reading: item.reading,
          unit: item.unit,
          recorded_at: item.recorded_at
        }))
      }
    }
  }


  if (request.type === 'personnel') {
    const permission = permissionFor(permissionByKey, 'personnel.view')
    if (!permission) return null

    const { data: record } = await supabase
      .from('forge_personnel')
      .select('*, locations(name, code), divisions(name, code)')
      .eq('organization_id', organizationId)
      .eq('id', request.id)
      .maybeSingle()

    if (!record) return null

    const allowed = await personnelRecordWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      record
    })

    if (!allowed) return null

    return {
      type: 'personnel',
      id: record.id,
      humanReference: record.employee_number || [record.first_name, record.last_name].filter(Boolean).join(' '),
      title: [record.first_name, record.last_name].filter(Boolean).join(' '),
      data: {
        employee_number: record.employee_number,
        name: [record.first_name, record.last_name].filter(Boolean).join(' '),
        employment_status: record.employment_status,
        job_title: record.job_title,
        hire_date: record.hire_date,
        location: record.locations?.name || null,
        division: record.divisions?.name || null,
        archived: Boolean(record.archived_at)
      }
    }
  }

  if (request.type === 'training_course') {
    const permission = permissionFor(permissionByKey, 'training.view')
    if (!permission) return null

    const { data: course } = await supabase
      .from('forge_training_courses')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', request.id)
      .maybeSingle()

    if (!course) return null

    const training = await getTrainingOverview({
      organizationId,
      userId,
      permission
    })

    const visibleAssignments = training.assignments.filter(
      (item: any) => item.course_id === course.id
    )
    const visibleCompletions = training.completions.filter(
      (item: any) => item.course_id === course.id
    )

    return {
      type: 'training_course',
      id: course.id,
      humanReference: course.course_code || course.title,
      title: course.title,
      data: {
        course_code: course.course_code,
        title: course.title,
        description: course.description,
        category: course.category_key,
        delivery_method: course.delivery_method,
        duration_minutes: course.duration_minutes,
        validity_months: course.validity_months,
        is_active: course.is_active,
        visible_assignment_count: visibleAssignments.length,
        visible_completion_count: visibleCompletions.length,
        visible_overdue_assignments: visibleAssignments.filter(
          (item: any) =>
            item.due_date &&
            item.due_date < new Date().toISOString().slice(0, 10) &&
            !['completed','canceled'].includes(String(item.status))
        ).length
      }
    }
  }

  if (request.type === 'qr') {
    const permission = permissionFor(permissionByKey, 'qr_management.view')
    if (!permission) return null

    const { data: qrCode } = await supabase
      .from('forge_qr_codes')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', request.id)
      .maybeSingle()

    if (!qrCode) return null

    const allowed = await qrCodeWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      qrCode
    })

    if (!allowed) return null

    const { data: asset } = await supabase
      .from('forge_assets')
      .select('asset_number, name, status, condition')
      .eq('organization_id', organizationId)
      .eq('id', qrCode.target_id)
      .maybeSingle()

    return {
      type: 'qr',
      id: qrCode.id,
      humanReference: qrCode.qr_number,
      title: qrCode.name,
      data: {
        qr_number: qrCode.qr_number,
        name: qrCode.name,
        description: qrCode.description,
        status: qrCode.status,
        target_type: qrCode.target_type,
        default_action: qrCode.default_action,
        expires_at: qrCode.expires_at,
        scan_count: Number(qrCode.scan_count || 0),
        last_scanned_at: qrCode.last_scanned_at,
        linked_asset: asset
          ? {
              asset_number: asset.asset_number,
              name: asset.name,
              status: asset.status,
              condition: asset.condition
            }
          : null
      }
    }
  }


  if (request.type === 'loto') {
    const permission = permissionFor(permissionByKey, 'loto.view')
    if (!permission) return null

    const { data: procedure } = await supabase
      .from('forge_loto_procedures')
      .select('*, forge_assets(asset_number, name, status, condition, criticality, locations(name, code), divisions(name, code))')
      .eq('organization_id', organizationId)
      .eq('id', request.id)
      .maybeSingle()

    if (!procedure) return null

    const allowed = await lotoProcedureWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      procedure
    })

    if (!allowed) return null

    const detail = await getLotoProcedureDetail({
      organizationId,
      procedureId: procedure.id
    })

    return {
      type: 'loto',
      id: procedure.id,
      humanReference: procedure.procedure_number,
      title: procedure.title,
      data: {
        procedure_number: procedure.procedure_number,
        title: procedure.title,
        description: procedure.description,
        purpose: procedure.purpose,
        scope: procedure.scope_text,
        status: procedure.status,
        revision_number: procedure.revision_number,
        effective_date: procedure.effective_date,
        next_review_date: procedure.next_review_date,
        required_ppe: procedure.required_ppe,
        special_precautions: procedure.special_precautions,
        authorized_employee_notes: procedure.authorized_employee_notes,
        affected_employee_notes: procedure.affected_employee_notes,
        shutdown_notes: procedure.shutdown_notes,
        restoration_notes: procedure.restoration_notes,
        equipment: procedure.forge_assets
          ? {
              asset_number: procedure.forge_assets.asset_number,
              name: procedure.forge_assets.name,
              status: procedure.forge_assets.status,
              condition: procedure.forge_assets.condition,
              criticality: procedure.forge_assets.criticality,
              location: procedure.forge_assets.locations?.name || null,
              division: procedure.forge_assets.divisions?.name || null
            }
          : null,
        energy_sources: detail.energySources.slice(0, 50).map((source: any) => ({
          energy_type: source.energy_type,
          source_name: source.source_name,
          magnitude: source.magnitude,
          isolation_location: source.isolation_location,
          isolation_device: source.isolation_device,
          lockout_device: source.lockout_device,
          stored_energy_method: source.stored_energy_method,
          verification_method: source.verification_method,
          notes: source.notes
        })),
        steps: detail.steps.slice(0, 100).map((step: any, index: number) => ({
          step_number: index + 1,
          step_type: step.step_type,
          title: step.title,
          instructions: step.instructions,
          warning_text: step.warning_text,
          verification_required: step.verification_required,
          verification_instructions: step.verification_instructions
        })),
        recent_reviews: detail.reviews.slice(0, 10).map((review: any) => ({
          reviewed_at: review.reviewed_at,
          review_result: review.review_result,
          employee_observed: review.employee_observed,
          deviations_found: review.deviations_found,
          corrective_actions: review.corrective_actions,
          notes: review.notes,
          next_review_date: review.next_review_date
        })),
        active_field_use: detail.applications.some((application: any) => application.status === 'in_progress')
      }
    }
  }

  return null
}
