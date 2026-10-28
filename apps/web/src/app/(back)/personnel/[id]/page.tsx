import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import PersonnelRecordForm from '../PersonnelRecordForm'
import PersonnelSensitivePanel from '../PersonnelSensitivePanel'
import type { PersonnelFormValues } from '../actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getPersonnelStructureOptions, personnelDisplayName } from '@/lib/forgePersonnelStructure'
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
    middle_name: record.middle_name || '',
    last_name: record.last_name,
    preferred_name: record.preferred_name || '',
    suffix: record.suffix || '',
    employee_number: record.employee_number || '',
    employment_status: record.employment_status,
    employment_type: record.employment_type || '',
    job_title: record.job_title || '',
    email: record.email || '',
    phone: record.phone || '',
    hire_date: record.hire_date || '',
    termination_date: record.termination_date || '',
    location_id: record.location_id || '',
    division_id: record.division_id || '',
    department_id: record.department_id || '',
    position_id: record.position_id || '',
    supervisor_personnel_id: record.supervisor_personnel_id || '',
    is_company_driver: Boolean(record.is_company_driver),
    is_dot_driver: Boolean(record.is_dot_driver)
  }

  const structure = await getPersonnelStructureOptions({
    organizationId,
    keepIds: [record.department_id, record.position_id]
  })

  // Sensitive data is loaded only when the viewer's sensitive scope reaches this record.
  const viewSensitivePermission = context.access.effective.find(item => item.permissionKey === 'personnel.view_sensitive' && item.allowed)
  const editSensitivePermission = context.access.effective.find(item => item.permissionKey === 'personnel.edit_sensitive' && item.allowed)

  const canViewSensitive = viewSensitivePermission
    ? await personnelRecordWithinScope({ organizationId, userId: context.user.id, scope: viewSensitivePermission.scope, record })
    : false

  const canEditSensitive = canViewSensitive && editSensitivePermission && !record.archived_at
    ? await personnelRecordWithinScope({ organizationId, userId: context.user.id, scope: editSensitivePermission.scope, record })
    : false

  const [sensitiveResult, contactsResult, sexLookup, eventsResult] = await Promise.all([
    canViewSensitive
      ? supabase.from('forge_personnel_sensitive').select('*').eq('personnel_id', record.id).eq('organization_id', organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    canViewSensitive
      ? supabase.from('forge_personnel_emergency_contacts').select('*').eq('personnel_id', record.id).eq('organization_id', organizationId).order('priority')
      : Promise.resolve({ data: [] }),
    canViewSensitive ? getEffectiveLookup({ organizationId, lookupKey: 'personnel.sex' }) : Promise.resolve({ options: [] as Array<{ key: string; label: string }> }),
    supabase
      .from('forge_personnel_employment_events')
      .select('id, event_type, from_value, to_value, effective_date, created_at')
      .eq('personnel_id', record.id)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50)
  ])

  const sensitive = sensitiveResult.data as any
  const statusLookup = await getEffectiveLookup({ organizationId, lookupKey: 'personnel.employment_status' })

  const nameById = new Map<string, string>([
    ...(locations || []).map((item: any) => [item.id, item.name] as [string, string]),
    ...(divisions || []).map((item: any) => [item.id, item.name] as [string, string]),
    ...structure.departments.map(item => [item.id, item.label] as [string, string]),
    ...structure.positions.map(item => [item.id, item.label] as [string, string]),
    ...structure.supervisors.map(item => [item.id, item.label] as [string, string]),
    ...statusLookup.options.map(option => [option.key, option.label] as [string, string])
  ])

  const describe = (value: string | null) => (value ? nameById.get(value) || 'a removed record' : 'none')

  const eventLabel: Record<string, string> = {
    hired: 'Record created',
    status_changed: 'Status changed',
    terminated: 'Terminated',
    rehired: 'Rehired',
    department_changed: 'Department changed',
    position_changed: 'Position changed',
    location_changed: 'Location changed',
    division_changed: 'Division changed',
    supervisor_changed: 'Supervisor changed',
    archived: 'Archived',
    restored: 'Restored'
  }

  const events = ((eventsResult as any).data || []) as Array<{
    id: number
    event_type: string
    from_value: string | null
    to_value: string | null
    effective_date: string | null
    created_at: string
  }>

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Personnel</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{personnelDisplayName(record)}</h1>
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
        departments={structure.departments}
        positions={structure.positions}
        supervisors={structure.supervisors}
        readOnly={!canEdit || Boolean(record.archived_at)}
        canArchive={Boolean(canArchive)}
      />

      {canViewSensitive ? (
        <PersonnelSensitivePanel
          personnelId={record.id}
          canEdit={Boolean(canEditSensitive)}
          sexOptions={sexLookup.options.map(option => ({ key: option.key, label: option.label }))}
          initialValues={{
            date_of_birth: sensitive?.date_of_birth || '',
            sex: sensitive?.sex || '',
            address_line1: sensitive?.address_line1 || '',
            address_line2: sensitive?.address_line2 || '',
            city: sensitive?.city || '',
            state_region: sensitive?.state_region || '',
            postal_code: sensitive?.postal_code || '',
            country_code: sensitive?.country_code || ''
          }}
          initialContacts={((contactsResult as any).data || []).map((contact: any) => ({
            name: contact.name || '',
            relationship: contact.relationship || '',
            phone: contact.phone || '',
            alternate_phone: contact.alternate_phone || '',
            email: contact.email || ''
          }))}
        />
      ) : null}

      <Card data-testid='personnel-employment-history'>
        <CardHeader>
          <CardTitle>Employment History</CardTitle>
          <CardDescription>Recorded automatically when status or assignment changes.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length ? (
            <ol className='flex flex-col gap-3'>
              {events.map(event => {
                const showValues = !['hired', 'archived', 'restored'].includes(event.event_type)
                return (
                  <li key={event.id} className='border-b pb-3 last:border-b-0'>
                    <div className='text-textPrimary font-semibold'>{eventLabel[event.event_type] || event.event_type}</div>
                    <div className='text-textSecondary text-sm'>
                      {showValues ? `${describe(event.from_value)} → ${describe(event.to_value)} · ` : ''}
                      {event.effective_date || event.created_at.slice(0, 10)}
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className='text-textSecondary text-sm'>No employment history recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default PersonnelDetailPage
