import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import OshaCaseEditor from './OshaCaseEditor'
import { oshaRecordWithinScope } from '@/lib/forgeOsha'
import { OSHA_RECORDABILITY_LABELS } from '@/lib/forgeOshaRules'
import type { OshaRecordability } from '@/lib/forgeOshaRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'OSHA Case' }

const text = (value: string | null | undefined) => value || ''

const OshaCasePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('osha.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: record } = await supabase
    .from('forge_osha_cases')
    .select('*, locations(name, code), forge_incidents(id, incident_number, summary)')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()

  if (!record) notFound()

  const mayView = await oshaRecordWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, record })

  if (!mayView) notFound()

  const editPermission = context.access.effective.find(item => item.permissionKey === 'osha.edit' && item.allowed)

  const canEdit = editPermission
    ? await oshaRecordWithinScope({ organizationId, userId: context.user.id, scope: editPermission.scope, record })
    : false

  const { data: activity } = await supabase
    .from('forge_osha_case_activity')
    .select('id, activity_type, message, created_at')
    .eq('organization_id', organizationId)
    .eq('case_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
          {context.activeOrganization.name} / OSHA / {record.locations?.name}
        </p>
        <div className='mt-1 flex flex-wrap items-center gap-3'>
          <h1 className='text-textPrimary text-3xl font-bold'>Case {record.case_number}</h1>
          <Badge size='sm' variant={record.recordability === 'recordable' ? 'tonalPrimary' : 'secondary'}>
            {OSHA_RECORDABILITY_LABELS[record.recordability as OshaRecordability]}
          </Badge>
          {record.is_privacy_case ? <Badge size='sm' variant='secondary'>Privacy case</Badge> : null}
          {record.status !== 'open' ? <Badge size='sm' variant='secondary' className='capitalize'>{record.status}</Badge> : null}
        </div>
        {record.forge_incidents ? (
          <p className='text-textSecondary mt-2'>
            From incident{' '}
            <Link className='text-primary font-semibold hover:underline' href={`/incidents/${record.forge_incidents.id}`}>
              {record.forge_incidents.incident_number}
            </Link>
            : {record.forge_incidents.summary}
          </p>
        ) : null}
        {record.status === 'voided' ? <p className='text-destructive mt-2'>Voided: {record.void_reason}</p> : null}
      </div>

      <OshaCaseEditor
        caseId={record.id}
        rowVersion={record.row_version}
        status={record.status}
        hasIncident={Boolean(record.incident_id)}
        canEdit={Boolean(canEdit)}
        initialValues={{
          employee_name: record.employee_name,
          job_title: text(record.job_title),
          injury_date: record.injury_date,
          event_location: text(record.event_location),
          injury_description: text(record.injury_description),
          recordability: record.recordability,
          not_recordable_reason: text(record.not_recordable_reason),
          is_privacy_case: record.is_privacy_case,
          case_outcome: record.case_outcome || '',
          case_type: record.case_type || '',
          days_away: record.days_away,
          restricted_days: record.restricted_days,
          date_of_death: text(record.date_of_death),
          employee_street: text(record.employee_street),
          employee_city: text(record.employee_city),
          employee_state: text(record.employee_state),
          employee_zip: text(record.employee_zip),
          employee_date_of_birth: text(record.employee_date_of_birth),
          employee_date_hired: text(record.employee_date_hired),
          employee_sex: record.employee_sex || '',
          physician_name: text(record.physician_name),
          treatment_facility: text(record.treatment_facility),
          treatment_street: text(record.treatment_street),
          treatment_city: text(record.treatment_city),
          treatment_state: text(record.treatment_state),
          treatment_zip: text(record.treatment_zip),
          treated_in_er: record.treated_in_er,
          hospitalized_overnight: record.hospitalized_overnight,
          time_began_work: text(record.time_began_work).slice(0, 5),
          time_of_event: text(record.time_of_event).slice(0, 5),
          time_cannot_be_determined: record.time_cannot_be_determined,
          activity_before: text(record.activity_before),
          what_happened: text(record.what_happened),
          injury_or_illness: text(record.injury_or_illness),
          object_or_substance: text(record.object_or_substance),
          completed_by_name: text(record.completed_by_name),
          completed_by_title: text(record.completed_by_title),
          completed_by_phone: text(record.completed_by_phone),
          completed_date: text(record.completed_date)
        }}
      />

      <Card data-testid='osha-case-activity'>
        <CardHeader>
          <CardTitle>Case History</CardTitle>
          <CardDescription>Visible only to people with OSHA access.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {(activity || []).length ? (activity || []).map((item: any) => (
            <div key={item.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium capitalize'>{String(item.activity_type).replaceAll('_', ' ')}</div>
                <div className='text-textSecondary text-xs'>{new Date(item.created_at).toLocaleString()}</div>
              </div>
              <div className='text-textSecondary mt-1 text-sm'>{item.message}</div>
            </div>
          )) : <p className='text-textSecondary text-sm'>No history yet.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

export default OshaCasePage
