import { createServiceRoleClient } from '@repo/supabase/server'

import { rcaFromRow } from '@/lib/forgeIncidentRcaRules'
import IncidentRcaPanel from './IncidentRcaPanel'

/**
 * Root-cause analysis (5 Whys) section of the incident detail page. Server component: loads the stored analysis (or
 * the 1.0-style default seed), the owner picker and the status of each linked CAPA, then renders the client panel.
 */
const IncidentRcaSection = async ({
  organizationId,
  incident,
  canEdit,
  canViewCapa
}: {
  organizationId: string
  incident: any
  canEdit: boolean
  canViewCapa: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: row, error }, { data: people }] = await Promise.all([
    supabase.from('forge_incident_rca').select('*').eq('organization_id', organizationId).eq('incident_id', incident.id).maybeSingle(),
    canEdit
      ? supabase
          .from('forge_personnel')
          .select('id, first_name, last_name, employee_number')
          .eq('organization_id', organizationId)
          .is('archived_at', null)
          .order('last_name')
          .order('first_name')
      : Promise.resolve({ data: [] })
  ])

  if (error) throw new Error('Unable to load the root-cause analysis: ' + error.message)

  const rca = rcaFromRow(row, incident)
  const capaIds = rca.actions.map(item => item.capaId).filter(Boolean) as string[]
  let capaStatuses: Record<string, string> = {}

  if (capaIds.length) {
    const { data: capas } = await supabase
      .from('forge_corrective_actions')
      .select('id, status')
      .eq('organization_id', organizationId)
      .in('id', capaIds)

    capaStatuses = Object.fromEntries((capas || []).map((capa: any) => [capa.id, capa.status]))
  }

  return (
    <IncidentRcaPanel
      incidentId={incident.id}
      initial={rca}
      saved={Boolean(row)}
      canEdit={canEdit}
      canViewCapa={canViewCapa}
      capaStatuses={capaStatuses}
      people={(people || []).map((person: any) => ({
        id: person.id,
        label: `${person.first_name} ${person.last_name}` + (person.employee_number ? ` (${person.employee_number})` : '')
      }))}
    />
  )
}

export default IncidentRcaSection
