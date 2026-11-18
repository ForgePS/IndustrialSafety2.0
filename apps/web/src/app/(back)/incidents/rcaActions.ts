'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { createCapaForSource } from '@/lib/forgeCapaCreate'
import { incidentWithinScope } from '@/lib/forgeIncidents'
import {
  capaSeverityForIncident,
  normalizeIncidentRca,
  prepareRcaForSave,
  rcaActionCapaBlocker,
  rcaFromRow,
  rcaToRow
} from '@/lib/forgeIncidentRcaRules'
import type { IncidentRca } from '@/lib/forgeIncidentRcaRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { ok: true; capaId?: string; capaNumber?: string; existing?: boolean } | { error: string }

const INCIDENT_FIELDS =
  'id, organization_id, incident_number, summary, description, immediate_actions, occurred_at, severity, status, location_id, division_id, reported_by_user_id, assigned_to_user_id'

/** The incident, when the caller holds `permissionKey` and its scope reaches the incident. */
const loadIncidentFor = async (permissionKey: string, incidentId: string) => {
  const context = await requireTenantPermission(permissionKey)
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: incident } = await supabase
    .from('forge_incidents')
    .select(INCIDENT_FIELDS)
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .maybeSingle()

  if (!incident) return { error: 'Incident not found.' } as const

  const allowed = await incidentWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, incident })

  if (!allowed) return { error: 'Incident not found.' } as const

  return { context, organizationId, supabase, incident }
}

const activity = async (supabase: any, organizationId: string, incidentId: string, userId: string, type: string, message: string, metadata = {}) => {
  await supabase.from('forge_incident_activity').insert({
    organization_id: organizationId,
    incident_id: incidentId,
    activity_type: type,
    message,
    actor_user_id: userId,
    metadata
  })
}

const loadStoredRca = async (supabase: any, organizationId: string, incident: any) => {
  const { data: row, error } = await supabase
    .from('forge_incident_rca')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('incident_id', incident.id)
    .maybeSingle()

  if (error) throw new Error('Unable to load the root-cause analysis: ' + error.message)

  return row ? { row, rca: rcaFromRow(row, incident) } : null
}

/** Saves the incident's root-cause analysis. Requires incidents.edit within scope; closed incidents are read-only. */
export const saveIncidentRca = async (incidentId: string, values: IncidentRca): Promise<Result> => {
  const loaded = await loadIncidentFor('incidents.edit', incidentId)

  if ('error' in loaded) return { error: loaded.error as string }

  const { context, organizationId, supabase, incident } = loaded

  if (incident.status === 'closed') return { error: 'A closed incident’s root-cause analysis cannot be changed.' }

  const stored = await loadStoredRca(supabase, organizationId, incident)
  const prepared = prepareRcaForSave(normalizeIncidentRca(values, incident.summary), stored?.rca || null)

  if ('error' in prepared) return prepared

  const rca = prepared.rca

  // Owners must be active personnel in this company; the stored name keeps the printable readable.
  const ownerIds = [...new Set(rca.actions.map(item => item.ownerPersonnelId).filter(Boolean) as string[])]

  if (ownerIds.length) {
    const { data: people } = await supabase
      .from('forge_personnel')
      .select('id, first_name, last_name')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .in('id', ownerIds)

    const names = new Map((people || []).map((person: any) => [person.id, `${person.first_name} ${person.last_name}`.trim()]))

    for (const item of rca.actions) {
      if (!item.ownerPersonnelId) {
        item.ownerName = ''
        continue
      }

      const name = names.get(item.ownerPersonnelId) as string | undefined

      if (!name) return { error: 'An action owner is not an active personnel record in this company.' }
      item.ownerName = name
    }
  } else {
    for (const item of rca.actions) item.ownerName = ''
  }

  const now = new Date().toISOString()
  const payload = { ...rcaToRow(rca), updated_by: context.user.id, updated_at: now }

  const { error } = stored
    ? await supabase.from('forge_incident_rca').update(payload).eq('id', stored.row.id)
    : await supabase.from('forge_incident_rca').insert({
        ...payload,
        organization_id: organizationId,
        incident_id: incident.id,
        created_by: context.user.id
      })

  if (error) return { error: 'Unable to save the root-cause analysis: ' + error.message }

  await activity(supabase, organizationId, incident.id, context.user.id, 'rca_saved', 'Root-cause analysis saved.')
  revalidatePath('/incidents/' + incident.id)

  return { ok: true }
}

/**
 * Opens a CAPA for one saved RCA action (source 'incident_rca_action' / the action key, so one CAPA per action),
 * links it to the incident and stores the CAPA on the action. Requires incidents.edit within scope, as saving the
 * analysis does; the CAPA is opened as a system source, as 1.0 did.
 */
export const createCapaForRcaAction = async (incidentId: string, actionKey: string): Promise<Result> => {
  const loaded = await loadIncidentFor('incidents.edit', incidentId)

  if ('error' in loaded) return { error: loaded.error as string }

  const { context, organizationId, supabase, incident } = loaded

  if (incident.status === 'closed') return { error: 'A closed incident’s root-cause analysis cannot be changed.' }

  const stored = await loadStoredRca(supabase, organizationId, incident)
  const action = stored?.rca.actions.find(item => item.key === actionKey)
  const blocker = rcaActionCapaBlocker(action)

  if (blocker || !action || !stored) return { error: blocker || 'Save the analysis before creating a CAPA for this action.' }

  if (action.capaId) return { ok: true, capaId: action.capaId, capaNumber: action.capaNumber || undefined, existing: true }

  const rootCause = stored.rca.rootCause

  const created = await createCapaForSource({
    organizationId,
    actorUserId: context.user.id,
    source: {
      type: 'incident_rca_action',
      id: action.key,
      reference: incident.incident_number,
      linkResourceType: 'incident',
      linkResourceId: incident.id
    },
    values: {
      title: action.action,
      description: `Root-cause analysis action from incident ${incident.incident_number}: ${incident.summary}`,
      action_type: 'corrective',
      severity: capaSeverityForIncident(incident.severity),
      location_id: incident.location_id || null,
      division_id: incident.division_id || null,
      due_at: action.dueDate ? new Date(action.dueDate + 'T12:00:00Z').toISOString() : null,
      root_cause: rootCause || null,
      assigned_personnel_id: action.ownerPersonnelId
    },
    createdMessage: `Corrective Action created from the root-cause analysis of incident ${incident.incident_number}`
  })

  if ('error' in created) return created

  const actions = stored.rca.actions.map(item =>
    item.key === action.key ? { ...item, capaId: created.id, capaNumber: created.actionNumber } : item
  )

  const { error } = await supabase
    .from('forge_incident_rca')
    .update({ actions, updated_by: context.user.id, updated_at: new Date().toISOString() })
    .eq('id', stored.row.id)

  if (error) return { error: `CAPA ${created.actionNumber} was created but could not be stored on the action: ${error.message}` }

  await activity(supabase, organizationId, incident.id, context.user.id, 'rca_capa_created', `CAPA ${created.actionNumber} created for root-cause action.`, {
    corrective_action_id: created.id,
    rca_action_key: action.key
  })
  revalidatePath('/incidents/' + incident.id)

  return { ok: true, capaId: created.id, capaNumber: created.actionNumber, existing: created.existing }
}

/** Opens a CAPA for the incident itself (one per incident). Requires corrective_actions.create and incident view scope. */
export const createCapaFromIncident = async (incidentId: string): Promise<Result> => {
  const loaded = await loadIncidentFor('incidents.view', incidentId)

  if ('error' in loaded) return { error: loaded.error as string }

  const createContext = await requireTenantPermission('corrective_actions.create')
  const { organizationId, supabase, incident } = loaded

  const created = await createCapaForSource({
    organizationId,
    actorUserId: createContext.user.id,
    source: {
      type: 'incident',
      id: incident.id,
      reference: incident.incident_number,
      linkResourceType: 'incident',
      linkResourceId: incident.id
    },
    values: {
      title: `${incident.incident_number}: ${incident.summary}`,
      description: incident.description || incident.summary,
      action_type: 'corrective',
      severity: capaSeverityForIncident(incident.severity),
      location_id: incident.location_id || null,
      division_id: incident.division_id || null,
      immediate_containment: incident.immediate_actions || null
    },
    createdMessage: `Corrective Action created from incident ${incident.incident_number}`
  })

  if ('error' in created) return created

  if (!created.existing) {
    await activity(supabase, organizationId, incident.id, createContext.user.id, 'capa_created', `CAPA ${created.actionNumber} created from this incident.`, {
      corrective_action_id: created.id
    })
  }

  revalidatePath('/incidents/' + incident.id)

  return { ok: true, capaId: created.id, capaNumber: created.actionNumber, existing: created.existing }
}
