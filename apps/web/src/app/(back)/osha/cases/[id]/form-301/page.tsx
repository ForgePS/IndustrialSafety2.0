import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import { oshaRecordWithinScope } from '@/lib/forgeOsha'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'OSHA Form 301' }

const yesNo = (value: boolean | null) => (value === true ? 'Yes' : value === false ? 'No' : '—')
const show = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value))

const Line = ({ label, value }: { label: string; value: unknown }) => (
  <div className='flex flex-col gap-1 border-b py-2 last:border-b-0 md:flex-row md:gap-4'>
    <div className='text-textSecondary text-sm md:w-1/3'>{label}</div>
    <div className='text-textPrimary whitespace-pre-wrap md:w-2/3'>{show(value)}</div>
  </div>
)

const Form301Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('osha.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: record } = await supabase
    .from('forge_osha_cases')
    .select('*, locations(name)')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()

  if (!record) notFound()
  const mayView = await oshaRecordWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, record })

  if (!mayView) notFound()

  const time = (value: string | null) => (value ? value.slice(0, 5) : null)

  return (
    <div className='flex min-w-0 flex-col gap-6' data-testid='osha-form-301'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / {record.locations?.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Form 301: Injury and Illness Incident Report</h1>
          <p className='text-textSecondary mt-2'>Case {record.case_number}. Contains confidential employee information; keep it secure.</p>
        </div>
        <Button variant='tonalDefault' asChild><Link href={`/osha/cases/${record.id}`}>Back to Case</Link></Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Information about the employee</CardTitle></CardHeader>
        <CardContent>
          <Line label='1) Full name' value={record.employee_name} />
          <Line label='2) Street' value={record.employee_street} />
          <Line label='City / State / ZIP' value={[record.employee_city, record.employee_state, record.employee_zip].filter(Boolean).join(', ')} />
          <Line label='3) Date of birth' value={record.employee_date_of_birth} />
          <Line label='4) Date hired' value={record.employee_date_hired} />
          <Line label='5) Sex' value={record.employee_sex === 'male' ? 'Male' : record.employee_sex === 'female' ? 'Female' : null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Information about the physician or other health care professional</CardTitle></CardHeader>
        <CardContent>
          <Line label='6) Name of physician or health care professional' value={record.physician_name} />
          <Line label='7) Facility' value={record.treatment_facility} />
          <Line label='Street / City / State / ZIP' value={[record.treatment_street, record.treatment_city, record.treatment_state, record.treatment_zip].filter(Boolean).join(', ')} />
          <Line label='8) Treated in an emergency room?' value={yesNo(record.treated_in_er)} />
          <Line label='9) Hospitalized overnight as an in-patient?' value={yesNo(record.hospitalized_overnight)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Information about the case</CardTitle></CardHeader>
        <CardContent>
          <Line label='10) Case number from the log' value={record.case_number} />
          <Line label='11) Date of injury or illness' value={record.injury_date} />
          <Line label='12) Time employee began work' value={time(record.time_began_work)} />
          <Line label='13) Time of event' value={record.time_cannot_be_determined ? 'Cannot be determined' : time(record.time_of_event)} />
          <Line label='14) What was the employee doing just before the incident occurred?' value={record.activity_before} />
          <Line label='15) What happened?' value={record.what_happened} />
          <Line label='16) What was the injury or illness?' value={record.injury_or_illness} />
          <Line label='17) What object or substance directly harmed the employee?' value={record.object_or_substance} />
          <Line label='18) If the employee died, when did death occur?' value={record.date_of_death} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Completed by</CardTitle></CardHeader>
        <CardContent>
          <Line label='Name' value={record.completed_by_name} />
          <Line label='Title' value={record.completed_by_title} />
          <Line label='Phone' value={record.completed_by_phone} />
          <Line label='Date' value={record.completed_date} />
        </CardContent>
      </Card>
    </div>
  )
}

export default Form301Page
