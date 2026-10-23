import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'

import WcCreateForm from './WcCreateForm'
import { incidentWithinScope } from '@/lib/forgeIncidents'
import { getPersonnelStructureOptions } from '@/lib/forgePersonnelStructure'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'New Workers\' Comp Case' }

const CreateWcCasePage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('workers_comp.create')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const params = await searchParams
  const requestedIncident = typeof params.incident === 'string' ? params.incident : ''

  const incidentView = context.access.effective.find(item => item.permissionKey === 'incidents.view' && item.allowed)

  const [{ data: incidentRows }, structure, { data: locations }] = await Promise.all([
    incidentView
      ? supabase
          .from('forge_incidents')
          .select('id, organization_id, incident_number, summary, occurred_at, reported_by_user_id, assigned_to_user_id, reported_by_personnel_id, location_id, division_id')
          .eq('organization_id', organizationId)
          .or('involves_injury.eq.true,incident_type.eq.injury')
          .order('occurred_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] }),
    getPersonnelStructureOptions({ organizationId }),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name')
  ])

  const incidents = incidentView
    ? (
        await Promise.all(
          (incidentRows || []).map(async (incident: any) => ({
            incident,
            allowed: await incidentWithinScope({ organizationId, userId: context.user.id, scope: incidentView.scope, incident })
          }))
        )
      )
        .filter(item => item.allowed)
        .map(item => item.incident)
    : []

  const preselected = incidents.find((incident: any) => incident.id === requestedIncident) || null
  let defaultPerson = preselected?.reported_by_personnel_id || ''

  if (preselected) {
    const { data: injured } = await supabase
      .from('forge_incident_people')
      .select('personnel_id')
      .eq('organization_id', organizationId)
      .eq('incident_id', preselected.id)
      .eq('role', 'injured')
      .not('personnel_id', 'is', null)
      .limit(1)

    defaultPerson = injured?.[0]?.personnel_id || defaultPerson
  }

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Workers&apos; Comp</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>New Case</h1>
      </div>

      <WcCreateForm
        incidents={incidents.map((incident: any) => ({
          id: incident.id,
          label: `${incident.incident_number} · ${new Date(incident.occurred_at).toLocaleDateString()} · ${incident.summary}`
        }))}
        people={structure.supervisors}
        locations={(locations || []).map((item: any) => ({ id: item.id, label: item.code ? `${item.name} (${item.code})` : item.name }))}
        initialValues={{
          incident_id: preselected?.id || '',
          personnel_id: defaultPerson,
          employee_name: '',
          injury_date: '',
          reported_date: '',
          location_id: '',
          severity: ''
        }}
      />
    </div>
  )
}

export default CreateWcCasePage
