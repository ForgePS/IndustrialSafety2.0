import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import IncidentRecordForm from '../IncidentRecordForm'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Report Incident' }

const CreateIncidentPage = async () => {
  const context = await requireTenantPermission('incidents.create')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    form,
    { data: allLocations },
    { data: allDivisions },
    personnel,
    assignments
  ] = await Promise.all([
    getEffectiveForm({ organizationId, formKey: 'incidents.report' }),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    getScopedPersonnel({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getTenantScopeAssignments({
      organizationId,
      userId: context.user.id
    })
  ])

  if (!form) {
    return <div className='rounded-lg border p-6'>Incident Report form is not configured.</div>
  }

  const locations =
    context.permission.scope === 'location'
      ? (allLocations || []).filter((item: any) => assignments.locationIds.includes(item.id))
      : (allLocations || [])

  const divisions =
    context.permission.scope === 'division'
      ? (allDivisions || []).filter((item: any) => assignments.divisionIds.includes(item.id))
      : (allDivisions || [])

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Incidents</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{form.name}</h1>
        <p className='text-textSecondary mt-2'>{form.description}</p>
      </div>

      <IncidentRecordForm
        form={form}
        locations={locations.map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
        divisions={divisions.map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
        personnel={personnel.map((person: any) => ({
          id: person.id,
          label: person.employee_number
            ? person.first_name + ' ' + person.last_name + ' (' + person.employee_number + ')'
            : person.first_name + ' ' + person.last_name
        }))}
      />
    </div>
  )
}

export default CreateIncidentPage
