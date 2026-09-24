import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { createServiceRoleClient } from '@repo/supabase/server'
import PersonnelRecordForm from '../PersonnelRecordForm'
import type { PersonnelFormValues } from '../actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import ForgeAiContextButton from '@/components/forge-ai/ForgeAiContextButton'

export const metadata: Metadata = { title: 'Personnel Profile' }

const PersonnelDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('personnel.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: record },
    form,
    { data: locations },
    { data: divisions }
  ] = await Promise.all([
    supabase.from('forge_personnel').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle(),
    getEffectiveForm({ organizationId, formKey: 'personnel.profile' }),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name')
  ])

  if (!record || !form) notFound()

  const mayView = await personnelRecordWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    record
  })

  if (!mayView) notFound()

  const editPermission = context.access.effective.find(item => item.permissionKey === 'personnel.edit' && item.allowed)
  const archivePermission = context.access.effective.find(item => item.permissionKey === 'personnel.archive' && item.allowed)
  const canUseAi = context.access.effective.some(item => item.permissionKey === 'forge_ai.use' && item.allowed)

  const canEdit = editPermission
    ? await personnelRecordWithinScope({
        organizationId,
        userId: context.user.id,
        scope: editPermission.scope,
        record
      })
    : false

  const canArchive = archivePermission && !record.archived_at
    ? await personnelRecordWithinScope({
        organizationId,
        userId: context.user.id,
        scope: archivePermission.scope,
        record
      })
    : false

  const initialValues: PersonnelFormValues = {
    first_name: record.first_name,
    last_name: record.last_name,
    employee_number: record.employee_number || '',
    employment_status: record.employment_status,
    job_title: record.job_title || '',
    email: record.email || '',
    phone: record.phone || '',
    hire_date: record.hire_date || '',
    location_id: record.location_id || '',
    division_id: record.division_id || ''
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Personnel</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{record.first_name} {record.last_name}</h1>
            {record.archived_at ? <Badge size='sm' variant='secondary'>Archived</Badge> : null}
          </div>
          <p className='text-textSecondary mt-2'>
            {canEdit ? 'Edit fields allowed by the tenant Form Builder.' : 'Read-only based on your current access.'}
          </p>
        </div>
        {canUseAi ? (
          <ForgeAiContextButton
            contextType='personnel'
            recordId={record.id}
            recordLabel={record.employee_number || record.first_name + ' ' + record.last_name}
          />
        ) : null}
      </div>

      <PersonnelRecordForm
        form={form}
        personnelId={record.id}
        initialValues={initialValues}
        locations={(locations || []).map((item: any) => ({ id: item.id, label: item.code ? `${item.name} (${item.code})` : item.name }))}
        divisions={(divisions || []).map((item: any) => ({ id: item.id, label: item.code ? `${item.name} (${item.code})` : item.name }))}
        readOnly={!canEdit || Boolean(record.archived_at)}
        canArchive={Boolean(canArchive)}
      />
    </div>
  )
}

export default PersonnelDetailPage
