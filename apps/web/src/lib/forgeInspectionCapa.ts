import { createServiceRoleClient } from '@repo/supabase/server'

import { createCapaForSource } from '@/lib/forgeCapaCreate'
import {
  INSPECTION_FINDING_CAPA_SOURCE,
  capaDueAtForFinding,
  capaSeverityForFinding,
  findingCapaDescription,
  findingCapaReference,
  findingCapaTitle,
  findingNeedsCapa
} from '@/lib/forgeInspectionCapaRules'

/**
 * Inspection finding → Corrective Action (1.0 opened one CAPA per failed item on inspection completion). Callers
 * check the actor's access to the inspection; the CAPA is opened without checking CAPA permissions.
 */

export type FindingCapa = { id: string; action_number: string; status: string; due_at: string | null }

/** Live (not archived/canceled) CAPAs keyed by finding id. */
export const getFindingCapas = async ({ organizationId, findingIds }: { organizationId: string; findingIds: string[] }) => {
  if (!findingIds.length) return {} as Record<string, FindingCapa>

  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_corrective_actions')
    .select('id, action_number, status, due_at, source_id, created_at')
    .eq('organization_id', organizationId)
    .eq('source_type', INSPECTION_FINDING_CAPA_SOURCE)
    .in('source_id', findingIds)
    .is('archived_at', null)
    .neq('status', 'canceled')
    .order('created_at', { ascending: true })

  const byFinding: Record<string, FindingCapa> = {}

  for (const row of data || []) {
    if (!byFinding[row.source_id]) byFinding[row.source_id] = { id: row.id, action_number: row.action_number, status: row.status, due_at: row.due_at }
  }

  return byFinding
}

/** The finding's assignee as a personnel record, else the inspection's inspector (1.0's responsible person). */
const ownerPersonnelId = async ({ supabase, organizationId, finding, inspection }: { supabase: any; organizationId: string; finding: any; inspection: any }) => {
  if (finding.assigned_to_user_id) {
    const { data: person } = await supabase
      .from('forge_personnel')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('auth_user_id', finding.assigned_to_user_id)
      .is('archived_at', null)
      .limit(1)
      .maybeSingle()

    if (person) return person.id as string
  }

  return (inspection.inspector_personnel_id as string) || null
}

export const createCapaForFinding = async ({
  organizationId,
  actorUserId,
  finding,
  inspection
}: {
  organizationId: string
  actorUserId: string | null
  finding: any
  inspection: any
}) => {
  const supabase = createServiceRoleClient() as any

  const result = await createCapaForSource({
    organizationId,
    actorUserId,
    source: {
      type: INSPECTION_FINDING_CAPA_SOURCE,
      id: finding.id,
      reference: findingCapaReference(inspection.inspection_number, finding.title),
      linkResourceType: 'inspection_finding',
      linkResourceId: finding.id
    },
    values: {
      title: findingCapaTitle(finding.title),
      description: findingCapaDescription(finding, inspection.inspection_number),
      action_type: 'corrective',
      severity: capaSeverityForFinding(finding.severity),
      location_id: inspection.location_id || null,
      division_id: inspection.division_id || null,
      due_at: capaDueAtForFinding(finding.due_date),
      assigned_personnel_id: await ownerPersonnelId({ supabase, organizationId, finding, inspection })
    },
    createdMessage: 'Corrective Action opened from inspection ' + (inspection.inspection_number || '') + ' finding'
  })

  if ('error' in result || result.existing) return result

  await supabase.from('forge_inspection_activity').insert({
    organization_id: organizationId,
    inspection_id: inspection.id,
    activity_type: 'finding_capa_created',
    message: 'Corrective Action ' + result.actionNumber + ' opened for finding: ' + finding.title,
    actor_user_id: actorUserId,
    metadata: { finding_id: finding.id, corrective_action_id: result.id }
  })

  return result
}

/** Opens a CAPA for every finding on the inspection that is still open. Idempotent (re-submits reuse the CAPA). */
export const createCapasForInspectionFindings = async ({
  organizationId,
  actorUserId,
  inspection
}: {
  organizationId: string
  actorUserId: string | null
  inspection: any
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: findings } = await supabase
    .from('forge_inspection_findings')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('inspection_id', inspection.id)
    .order('created_at', { ascending: true })

  let created = 0
  const errors: string[] = []

  for (const finding of (findings || []).filter(findingNeedsCapa)) {
    const result = await createCapaForFinding({ organizationId, actorUserId, finding, inspection })

    if ('error' in result) errors.push(finding.title + ': ' + result.error)
    else if (!result.existing) created += 1
  }

  return { created, errors }
}
