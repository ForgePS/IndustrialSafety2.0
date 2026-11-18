import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import TaskRecordForm from '../TaskRecordForm'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Create Task' }

const CreateTaskPage = async () => {
  const context = await requireTenantPermission('tasks.create')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const assignPermission = context.access.effective.find(
    item => item.permissionKey === 'tasks.assign' && item.allowed
  )
  const resourcePermission = (assignPermission || context.permission) as any

  const [form, personnel, { data: allLocations }, { data: allDivisions }, assignments] = await Promise.all([
    getEffectiveForm({ organizationId, formKey: 'tasks.task' }),
    getScopedPersonnel({
      organizationId,
      userId: context.user.id,
      permission: resourcePermission
    }),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    getTenantScopeAssignments({ organizationId, userId: context.user.id })
  ])

  if (!form) return <div className='rounded-lg border p-6'>Task form is not configured.</div>

  const scope = resourcePermission.scope

  const locations =
    scope === 'organization'
      ? (allLocations || [])
      : (allLocations || []).filter((item: any) => assignments.locationIds.includes(item.id))

  const divisions =
    scope === 'organization'
      ? (allDivisions || [])
      : (allDivisions || []).filter((item: any) => assignments.divisionIds.includes(item.id))

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Tasks</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{form.name}</h1>
        <p className='text-textSecondary mt-2'>{form.description}</p>
      </div>

      <TaskRecordForm
        form={form}
        canAssign={Boolean(assignPermission)}
        personnel={personnel.map((person: any) => ({
          id: person.id,
          label: person.employee_number
            ? person.first_name + ' ' + person.last_name + ' (' + person.employee_number + ')'
            : person.first_name + ' ' + person.last_name
        }))}
        locations={locations.map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
        divisions={divisions.map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
      />
    </div>
  )
}

export default CreateTaskPage
