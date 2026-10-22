import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'

import PrintButton from './PrintButton'
import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getWcPeriods, wcRecordWithinScope, wcTodayIso, withWorkDays } from '@/lib/forgeWorkersComp'
import {
  WC_LOWER_EXTREMITY_LABELS,
  WC_SEVERITY_LABELS,
  WC_STAGE_LABELS,
  WC_UPPER_EXTREMITY_LABELS,
  WC_WORK_STATUS_LABELS
} from '@/lib/forgeWorkersCompRules'
import type { WcSeverity, WcStage, WcWorkStatus } from '@/lib/forgeWorkersCompRules'

export const metadata: Metadata = { title: 'Workers\' Comp Case Report' }

const show = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value))

const Row = ({ label, value }: { label: string; value: unknown }) => (
  <div className='flex gap-4 border-b py-1.5 text-sm last:border-b-0'>
    <div className='text-textSecondary w-48 shrink-0'>{label}</div>
    <div className='text-textPrimary whitespace-pre-wrap'>{show(value)}</div>
  </div>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className='break-inside-avoid rounded-lg border p-4 print:rounded-none print:border-0 print:border-b print:p-0 print:pb-3'>
    <h2 className='text-textPrimary mb-2 text-lg font-semibold'>{title}</h2>
    {children}
  </section>
)

const WcCaseReportPage = async ({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) => {
  const context = await requireTenantPermission('workers_comp.view')
  const { id } = await params
  const query = await searchParams
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const supabase = createServiceRoleClient() as any

  const { data: record } = await supabase
    .from('forge_wc_cases')
    .select('*, locations(name), forge_wc_carriers(name, policy_number, phone, email), forge_incidents(incident_number, summary)')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()

  if (!record) notFound()
  if (!(await wcRecordWithinScope({ organizationId, userId, scope: context.permission.scope, record }))) notFound()

  const medicalPermission = context.access.effective.find(item => item.permissionKey === 'workers_comp.medical.view' && item.allowed)
  const canViewMedical = medicalPermission ? await wcRecordWithinScope({ organizationId, userId, scope: medicalPermission.scope, record }) : false
  const includeMedical = canViewMedical && query.medical === '1'

  const [periodsByCase, { data: restrictions }, { data: weekly }, medical] = await Promise.all([
    getWcPeriods(organizationId, [id]),
    supabase.from('forge_wc_restrictions').select('*').eq('organization_id', organizationId).eq('case_id', id).order('start_date'),
    supabase.from('forge_wc_weekly_updates').select('week_of, notes').eq('organization_id', organizationId).eq('case_id', id).order('week_of', { ascending: false }),
    includeMedical
      ? supabase.from('forge_wc_medical_encounters').select('*').eq('organization_id', organizationId).eq('case_id', id).order('encounter_date')
      : Promise.resolve({ data: [] })
  ])

  const periods = periodsByCase.get(id) || []
  const live = withWorkDays(record, periods, wcTodayIso())

  await writeForgeAudit({
    actorUserId: userId,
    organizationId,
    action: 'workers_comp.case_printed',
    entityType: 'workers_comp_case',
    entityId: id,
    afterValue: { included_medical: includeMedical }
  })

  return (
    <div className='flex min-w-0 flex-col gap-4' data-testid='wc-case-report'>
      <div className='flex flex-wrap items-center justify-between gap-3 print:hidden'>
        <div className='flex flex-wrap gap-3'>
          <Button variant='tonalDefault' asChild><Link href={`/workers-comp/${id}`}>Back to Case</Link></Button>
          {canViewMedical ? (
            <Button variant='outline' asChild>
              <Link href={`/workers-comp/${id}/print${includeMedical ? '' : '?medical=1'}`}>
                {includeMedical ? 'Hide Medical Visits' : 'Include Medical Visits'}
              </Link>
            </Button>
          ) : null}
        </div>
        <PrintButton />
      </div>

      <div>
        <p className='text-textSecondary text-sm'>{context.activeOrganization.name} · Workers&apos; compensation case report · printed {wcTodayIso()}</p>
        <h1 className='text-textPrimary text-2xl font-bold'>{record.case_number}: {record.employee_name}</h1>
        <p className='text-textSecondary text-sm'>Confidential. Contains claim{includeMedical ? ' and medical' : ''} information.</p>
      </div>

      <Section title='Injury'>
        <Row label='Injury date' value={record.injury_date} />
        <Row label='Reported to employer' value={record.reported_date} />
        <Row label='Location' value={record.locations?.name} />
        <Row label='Incident' value={record.forge_incidents ? `${record.forge_incidents.incident_number}: ${record.forge_incidents.summary}` : null} />
        <Row label='Body parts' value={record.body_parts} />
        <Row label='Severity' value={record.severity ? WC_SEVERITY_LABELS[record.severity as WcSeverity] : null} />
        <Row label='Stage' value={`${WC_STAGE_LABELS[record.stage as WcStage]}${record.status !== 'active' ? ` (${record.status})` : ''}`} />
      </Section>

      <Section title='Claim'>
        {record.is_self_pay ? <Row label='Carrier' value='Self pay' /> : (
          <>
            <Row label='Carrier' value={record.forge_wc_carriers?.name} />
            <Row label='Policy number' value={record.forge_wc_carriers?.policy_number} />
            <Row label='Claim number' value={record.claim_number} />
            <Row label='Adjuster' value={[record.adjuster_name, record.adjuster_phone, record.adjuster_email].filter(Boolean).join(' · ')} />
          </>
        )}
        <Row label='Claim notes' value={record.claim_notes} />
        <Row label='OSHA recordable' value={record.osha_recordable ? `Yes${record.osha_privacy_case ? ' (privacy case)' : ''}` : 'No'} />
      </Section>

      <Section title={`Work Status (${live.daysAway} days away, ${live.restrictedDays} restricted)`}>
        {periods.length ? periods.map((period: any) => (
          <Row key={period.id} label={`${period.start_date} → ${period.end_date || 'ongoing'}`} value={`${WC_WORK_STATUS_LABELS[period.work_status as WcWorkStatus]}${period.notes ? ` · ${period.notes}` : ''}`} />
        )) : <p className='text-textSecondary text-sm'>No work status recorded.</p>}
      </Section>

      <Section title='Restrictions'>
        {(restrictions || []).length ? (restrictions || []).map((item: any) => (
          <Row
            key={item.id}
            label={`${item.start_date} → ${item.end_date || (item.status === 'active' ? 'until lifted' : 'lifted')}`}
            value={[
              item.transitional_hours_per_day ? `${item.transitional_hours_per_day} hours/day` : null,
              item.stand_walk_hours ? `Stand/walk ${item.stand_walk_hours} h` : null,
              item.sit_hours ? `Sit ${item.sit_hours} h` : null,
              item.lifting_level ? `Lifting: ${item.lifting_level}` : null,
              item.push_pull_limit_lbs !== null ? `Push/pull ≤ ${item.push_pull_limit_lbs} lbs` : null,
              ...(item.upper_extremity || []).map((key: string) => WC_UPPER_EXTREMITY_LABELS[key] || key),
              ...(item.lower_extremity || []).map((key: string) => WC_LOWER_EXTREMITY_LABELS[key] || key),
              item.description
            ].filter(Boolean).join(' · ')}
          />
        )) : <p className='text-textSecondary text-sm'>No restrictions recorded.</p>}
      </Section>

      {includeMedical ? (
        <Section title='Medical Visits'>
          {(medical.data || []).length ? (medical.data || []).map((item: any) => (
            <div key={item.id} className='mb-2'>
              <Row label={`${item.encounter_date}`} value={[item.provider_name, item.provider_specialty, item.facility].filter(Boolean).join(' · ')} />
              <Row label='Diagnosis' value={item.diagnosis} />
              <Row label='Treatment' value={item.treatment} />
              <Row label='Medication' value={item.medication} />
              <Row label='Next appointment' value={item.next_appointment_date} />
            </div>
          )) : <p className='text-textSecondary text-sm'>No medical visits recorded.</p>}
        </Section>
      ) : null}

      <Section title='Weekly Updates'>
        {(weekly || []).length ? (weekly || []).map((item: any) => <Row key={item.week_of} label={`Week of ${item.week_of}`} value={item.notes} />) : (
          <p className='text-textSecondary text-sm'>No weekly updates.</p>
        )}
      </Section>
    </div>
  )
}

export default WcCaseReportPage
