import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import PersonnelRecordForm from '../PersonnelRecordForm'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Add Personnel' }

const AddPersonnelPage = async () => {
  const context = await requireTenantPermission('personnel.create')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    form,
    { data: allLocations },
    { data: allDivisions },
    assignments
  ] = await Promise.all([
    getEffectiveForm({ organizationId, formKey: 'personnel.profile' }),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    getTenantScopeAssignments({ organizationId, userId: context.user.id })
  ])

  if (!form) {
    return (
      <div className='flex flex-col gap-4'>
        <h1 className='text-textPrimary text-3xl font-bold'>Personnel Form Not Configured</h1>
        <Button variant='outline' asChild><Link href='/personnel'>Back to Personnel</Link></Button>
      </div>
    )
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
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name}</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{form.name}</h1>
        <p className='text-textSecondary mt-2'>{form.description || 'Create a personnel record.'}</p>
      </div>

      <PersonnelRecordForm
        form={form}
        locations={locations.map((item: any) => ({ id: item.id, label: item.code ? `${item.name} (${item.code})` : item.name }))}
        divisions={divisions.map((item: any) => ({ id: item.id, label: item.code ? `${item.name} (${item.code})` : item.name }))}
      />
    </div>
  )
}

export default AddPersonnelPage
