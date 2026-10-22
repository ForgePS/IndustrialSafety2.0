import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import { WcCaseEditor, WcMedicalPanel, WcRestrictionsPanel, WcWeeklyPanel, WcWorkStatusPanel } from './WcCasePanels'
import RecordEvidencePanel from '@/components/workflow/RecordEvidencePanel'
import { listRecordEvidence } from '@/lib/forgeEvidence'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getWcPeriods, wcRecordWithinScope, wcTodayIso, withWorkDays } from '@/lib/forgeWorkersComp'
import {
  WC_LOWER_EXTREMITY_LABELS,
  WC_STAGE_LABELS,
  WC_UPPER_EXTREMITY_LABELS,
  canEditAuthoredNote,
  thursdayWeekOf,
  weeklyUpdateStatus
} from '@/lib/forgeWorkersCompRules'
import type { WcStage } from '@/lib/forgeWorkersCompRules'

export const metadata: Metadata = { title: 'Workers\' Comp Case' }

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))

const WcCasePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('workers_comp.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const supabase = createServiceRoleClient() as any

  const { data: record } = await supabase
    .from('forge_wc_cases')
    .select('*, locations(name), forge_incidents(id, incident_number, summary)')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()

  if (!record) notFound()
  if (!(await wcRecordWithinScope({ organizationId, userId, scope: context.permission.scope, record }))) notFound()

  const permission = (key: string) => context.access.effective.find(item => item.permissionKey === key && item.allowed) || null

  const within = async (key: string) => {
    const found = permission(key)

    return found ? wcRecordWithinScope({ organizationId, userId, scope: found.scope, record }) : false
  }

  const [canEdit, canViewMedical, canManageMedical] = await Promise.all([
    within('workers_comp.edit'),
    within('workers_comp.medical.view'),
    within('workers_comp.medical.manage')
  ])

  const canConfigure = Boolean(permission('workers_comp.configure'))
  const showMedical = canViewMedical || canManageMedical

  const today = wcTodayIso()
  const currentWeek = thursdayWeekOf(today)

  const [periodsByCase, { data: restrictions }, { data: carriers }, { data: weekly }, { data: activity }, medical, osha] = await Promise.all([
    getWcPeriods(organizationId, [id]),
    supabase.from('forge_wc_restrictions').select('*').eq('organization_id', organizationId).eq('case_id', id).order('start_date', { ascending: false }),
    supabase.from('forge_wc_carriers').select('id, name, is_active').eq('organization_id', organizationId).order('name'),
    supabase.from('forge_wc_weekly_updates').select('id, week_of, notes, created_by').eq('organization_id', organizationId).eq('case_id', id).order('week_of', { ascending: false }),
    supabase.from('forge_wc_case_activity').select('id, activity_type, message, created_at').eq('organization_id', organizationId).eq('case_id', id).order('created_at', { ascending: false }).limit(50),
    showMedical
      ? supabase.from('forge_wc_medical_encounters').select('*').eq('organization_id', organizationId).eq('case_id', id).order('encounter_date', { ascending: false })
      : Promise.resolve({ data: [] }),
    record.osha_case_id
      ? supabase.from('forge_osha_cases').select('id, case_number, recordability, days_away, restricted_days').eq('id', record.osha_case_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])

  const periods = periodsByCase.get(id) || []

  // Shared evidence service: enforces workers_comp.view plus records.evidence.view for this case.
  const documents = await listRecordEvidence({ organizationId, resourceType: 'workers_comp_case', resourceId: id })
  const live = withWorkDays(record, periods, today)
  const editable = canEdit && record.status !== 'archived'

  const restrictionSummary = (item: any) => [
    item.transitional_hours_per_day ? `${item.transitional_hours_per_day} hours/day` : null,
    item.stand_walk_hours ? `Stand/walk ${item.stand_walk_hours} h` : null,
    item.sit_hours ? `Sit ${item.sit_hours} h` : null,
    item.lifting_level ? `Lifting: ${item.lifting_level}` : null,
    item.push_pull_limit_lbs !== null ? `Push/pull ≤ ${item.push_pull_limit_lbs} lbs` : null,
    ...(item.upper_extremity || []).map((key: string) => WC_UPPER_EXTREMITY_LABELS[key] || key),
    ...(item.lower_extremity || []).map((key: string) => WC_LOWER_EXTREMITY_LABELS[key] || key),
    item.description
  ].filter(Boolean) as string[]

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
          {context.activeOrganization.name} / Workers&apos; Comp{record.locations?.name ? ` / ${record.locations.name}` : ''}
        </p>
        <div className='mt-1 flex flex-wrap items-center gap-3'>
          <h1 className='text-textPrimary text-3xl font-bold'>{record.case_number}</h1>
          <Link className='text-primary text-sm font-semibold hover:underline' href={`/workers-comp/${record.id}/print`}>Printable report</Link>
          <Badge size='sm' variant='secondary'>{WC_STAGE_LABELS[record.stage as WcStage]}</Badge>
          {record.status !== 'active' ? <Badge size='sm' variant='secondary' className='capitalize'>{record.status}</Badge> : null}
        </div>
        <p className='text-textSecondary mt-2'>
          {record.employee_name} · injured {record.injury_date}
          {record.forge_incidents ? (
            <>
              {' · incident '}
              <Link className='text-primary font-semibold hover:underline' href={`/incidents/${record.forge_incidents.id}`}>{record.forge_incidents.incident_number}</Link>
            </>
          ) : null}
        </p>
      </div>

      <WcCaseEditor
        key={record.row_version}
        caseId={record.id}
        rowVersion={record.row_version}
        status={record.status}
        hasIncident={Boolean(record.incident_id)}
        canEdit={Boolean(canEdit)}
        carriers={(carriers || [])
          .filter((item: any) => item.is_active || item.id === record.carrier_id)
          .map((item: any) => ({ id: item.id, label: item.is_active ? item.name : `${item.name} (inactive)` }))}
        oshaCase={osha.data ? {
          id: osha.data.id,
          caseNumber: osha.data.case_number,
          recordability: osha.data.recordability,
          daysAway: osha.data.days_away,
          restrictedDays: osha.data.restricted_days
        } : null}
        initialValues={{
          injury_date: record.injury_date,
          reported_date: text(record.reported_date),
          stage: record.stage,
          severity: record.severity || '',
          carrier_id: text(record.carrier_id),
          is_self_pay: record.is_self_pay,
          claim_number: text(record.claim_number),
          adjuster_name: text(record.adjuster_name),
          adjuster_phone: text(record.adjuster_phone),
          adjuster_email: text(record.adjuster_email),
          body_parts: text(record.body_parts),
          claim_notes: text(record.claim_notes),
          next_action_label: text(record.next_action_label),
          next_action_due: text(record.next_action_due),
          next_action_priority: record.next_action_priority || '',
          osha_recordable: record.osha_recordable,
          osha_privacy_case: record.osha_privacy_case,
          osha_case_type: record.osha_case_type || '',
          osha_case_outcome_override: record.osha_case_outcome_override || ''
        }}
      />

      <WcWorkStatusPanel
        caseId={record.id}
        today={today}
        canEdit={editable}
        daysAway={live.daysAway}
        restrictedDays={live.restrictedDays}
        periods={periods.map((period: any) => ({
          ...period,
          canChange: canEditAuthoredNote({ userId, createdBy: period.created_by, canConfigure })
        }))}
      />

      <WcRestrictionsPanel
        caseId={record.id}
        today={today}
        canEdit={editable}
        restrictions={(restrictions || []).map((item: any) => ({
          id: item.id,
          status: item.status,
          start_date: item.start_date,
          end_date: item.end_date,
          summary: restrictionSummary(item),
          canChange: canEditAuthoredNote({ userId, createdBy: item.created_by, canConfigure }),
          values: {
            start_date: item.start_date,
            end_date: text(item.end_date),
            stand_walk_hours: item.stand_walk_hours || '',
            sit_hours: item.sit_hours || '',
            lifting_level: item.lifting_level || '',
            upper_extremity: item.upper_extremity || [],
            lower_extremity: item.lower_extremity || [],
            push_pull_limit_lbs: text(item.push_pull_limit_lbs),
            transitional_hours_per_day: item.transitional_hours_per_day ? (String(item.transitional_hours_per_day) as '2' | '4' | '6' | '8') : '',
            description: text(item.description)
          }
        }))}
      />

      <div data-testid='wc-documents'>
        <RecordEvidencePanel
          resourceType='workers_comp_case'
          resourceId={record.id}
          evidence={documents}
          canUpload={editable}
        />
        <p className='text-textSecondary mt-2 text-xs'>
          Claim packets, carrier letters and forms. Anyone with workers&apos; comp access to this case can open these files; keep detailed medical records in Medical Visits.
        </p>
      </div>

      {showMedical ? (
        <WcMedicalPanel
          caseId={record.id}
          today={today}
          canManage={Boolean(canManageMedical) && record.status !== 'archived'}
          encounters={(medical.data || []).map((item: any) => ({
            id: item.id,
            canEdit: canEditAuthoredNote({ userId, createdBy: item.created_by, canConfigure }),
            values: {
              encounter_date: item.encounter_date,
              provider_name: text(item.provider_name),
              provider_specialty: text(item.provider_specialty),
              facility: text(item.facility),
              symptoms: text(item.symptoms),
              exam_findings: text(item.exam_findings),
              diagnosis: text(item.diagnosis),
              assessment: text(item.assessment),
              treatment: text(item.treatment),
              medication: text(item.medication),
              notes: text(item.notes),
              next_appointment_date: text(item.next_appointment_date)
            }
          }))}
        />
      ) : null}

      <WcWeeklyPanel
        caseId={record.id}
        currentWeek={currentWeek}
        weekStatus={weeklyUpdateStatus(currentWeek, (weekly || []).some((item: any) => item.week_of === currentWeek), today)}
        canEdit={editable && record.status === 'active'}
        updates={(weekly || []).map((item: any) => ({
          id: item.id,
          week_of: item.week_of,
          notes: item.notes,
          canEdit: canEditAuthoredNote({ userId, createdBy: item.created_by, canConfigure })
        }))}
      />

      <Card data-testid='wc-activity'>
        <CardHeader>
          <CardTitle>Case History</CardTitle>
          <CardDescription>Medical details are never written to history.</CardDescription>
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

export default WcCasePage
