import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getScopedWcCases, wcRecordWithinScope } from '@/lib/forgeWorkersComp'
import { WC_SEVERITY_LABELS, WC_STAGE_LABELS, WC_WORK_STATUS_LABELS } from '@/lib/forgeWorkersCompRules'

/** 1.0 report catalog (workers_comp.*), delivered as CSV until 2.0 has a reporting center. */
export const WC_REPORTS = [
  { key: 'open_cases', name: 'Open Cases', description: 'Active cases with claim, stage and duty status.', medical: false },
  { key: 'by_status', name: 'Cases by Status', description: 'Case counts by status, stage and severity.', medical: false },
  { key: 'lost_time', name: 'Lost-Time Cases', description: 'Cases with days away from work.', medical: false },
  { key: 'restricted_duty', name: 'Restricted Duty', description: 'Cases with restricted days and their active restrictions.', medical: false },
  { key: 'work_status_history', name: 'Work Status History', description: 'Every work status period with its case.', medical: false },
  { key: 'claims_summary', name: 'Claims Summary', description: 'Carrier, claim number, adjuster, body parts and injury date.', medical: false },
  { key: 'medical_encounters', name: 'Medical Visits', description: 'Medical visit detail. Requires workers\' comp medical access.', medical: true }
] as const

export type WcReportKey = (typeof WC_REPORTS)[number]['key']

const label = <T extends string>(labels: Record<T, string>, value: string | null) => (value ? labels[value as T] || value : '')

export const buildWcReport = async ({
  key,
  organizationId,
  userId,
  permission,
  medicalPermission
}: {
  key: WcReportKey
  organizationId: string
  userId: string
  permission: EffectivePermission
  medicalPermission: EffectivePermission | null
}): Promise<{ header: string[]; rows: unknown[][] } | { error: string }> => {
  const cases = await getScopedWcCases({ organizationId, userId, permission })
  const supabase = createServiceRoleClient() as any

  const caseColumns = (row: any) => [
    row.case_number,
    row.employee_name,
    row.injury_date,
    row.locations?.name || '',
    row.status,
    label(WC_STAGE_LABELS, row.stage) as string,
    label(WC_SEVERITY_LABELS, row.severity) as string
  ]

  const caseHeader = ['Case', 'Employee', 'Injury date', 'Location', 'Status', 'Stage', 'Severity']

  switch (key) {
    case 'open_cases':
      return {
        header: [...caseHeader, 'Work status', 'Days away', 'Days restricted', 'Claim number', 'Carrier', 'OSHA recordable'],
        rows: cases
          .filter((row: any) => row.status === 'active')
          .map((row: any) => [
            ...caseColumns(row),
            label(WC_WORK_STATUS_LABELS, row.current_work_status) as string,
            row.daysAway,
            row.restrictedDays,
            row.is_self_pay ? 'Self pay' : row.claim_number || '',
            row.forge_wc_carriers?.name || '',
            row.osha_recordable ? 'Yes' : 'No'
          ])
      }

    case 'by_status': {
      const counts = new Map<string, number>()

      for (const row of cases) {
        const groupKey = [row.status, label(WC_STAGE_LABELS, row.stage), label(WC_SEVERITY_LABELS, row.severity) || 'Not set'].join('|')

        counts.set(groupKey, (counts.get(groupKey) || 0) + 1)
      }

      return {
        header: ['Status', 'Stage', 'Severity', 'Cases'],
        rows: [...counts.entries()].sort().map(([groupKey, count]) => [...groupKey.split('|'), count])
      }
    }

    case 'lost_time':
      return {
        header: [...caseHeader, 'Days away', 'Currently off work'],
        rows: cases
          .filter((row: any) => row.daysAway > 0 || row.severity === 'lost_time')
          .map((row: any) => [...caseColumns(row), row.daysAway, row.current_work_status === 'off_work' ? 'Yes' : 'No'])
      }

    case 'restricted_duty': {
      const restricted = cases.filter((row: any) => row.restrictedDays > 0 || row.current_work_status === 'restricted')

      const { data: restrictions } = restricted.length
        ? await supabase
            .from('forge_wc_restrictions')
            .select('case_id, start_date, end_date, lifting_level, transitional_hours_per_day')
            .eq('organization_id', organizationId)
            .eq('status', 'active')
            .in('case_id', restricted.map((row: any) => row.id))
        : { data: [] }

      const active = new Map<string, string[]>()

      for (const item of restrictions || []) {
        const text = [`from ${item.start_date}`, item.lifting_level ? `lifting ${item.lifting_level}` : null, item.transitional_hours_per_day ? `${item.transitional_hours_per_day} h/day` : null]
          .filter(Boolean)
          .join(', ')

        active.set(item.case_id, [...(active.get(item.case_id) || []), text])
      }

      return {
        header: [...caseHeader, 'Days restricted', 'Currently restricted', 'Active restrictions'],
        rows: restricted.map((row: any) => [
          ...caseColumns(row),
          row.restrictedDays,
          row.current_work_status === 'restricted' ? 'Yes' : 'No',
          (active.get(row.id) || []).join('; ')
        ])
      }
    }

    case 'work_status_history': {
      const byId = new Map<string, any>(cases.map((row: any) => [row.id, row]))

      const { data: periods } = cases.length
        ? await supabase
            .from('forge_wc_work_status_periods')
            .select('case_id, work_status, start_date, end_date, notes')
            .eq('organization_id', organizationId)
            .in('case_id', cases.map((row: any) => row.id))
            .order('start_date')
        : { data: [] }

      return {
        header: ['Case', 'Employee', 'Work status', 'From', 'Through', 'Notes'],
        rows: (periods || []).map((period: any) => [
          byId.get(period.case_id)?.case_number,
          byId.get(period.case_id)?.employee_name,
          label(WC_WORK_STATUS_LABELS, period.work_status),
          period.start_date,
          period.end_date || 'ongoing',
          period.notes || ''
        ])
      }
    }

    case 'claims_summary':
      return {
        header: ['Case', 'Employee', 'Injury date', 'Reported', 'Carrier', 'Claim number', 'Adjuster', 'Adjuster phone', 'Adjuster email', 'Body parts', 'Status'],
        rows: cases.map((row: any) => [
          row.case_number,
          row.employee_name,
          row.injury_date,
          row.reported_date || '',
          row.is_self_pay ? 'Self pay' : row.forge_wc_carriers?.name || '',
          row.claim_number || '',
          row.adjuster_name || '',
          row.adjuster_phone || '',
          row.adjuster_email || '',
          row.body_parts || '',
          row.status
        ])
      }

    case 'medical_encounters': {
      if (!medicalPermission) return { error: 'This report needs workers\' comp medical access.' }

      // Medical access can have a narrower scope than case access.
      const reachable = (
        await Promise.all(cases.map(async (row: any) => ({ row, ok: await wcRecordWithinScope({ organizationId, userId, scope: medicalPermission.scope, record: row }) })))
      ).filter(item => item.ok).map(item => item.row)

      const byId = new Map<string, any>(reachable.map((row: any) => [row.id, row]))

      const { data: visits } = reachable.length
        ? await supabase
            .from('forge_wc_medical_encounters')
            .select('*')
            .eq('organization_id', organizationId)
            .in('case_id', reachable.map((row: any) => row.id))
            .order('encounter_date')
        : { data: [] }

      return {
        header: ['Case', 'Employee', 'Visit date', 'Provider', 'Specialty', 'Facility', 'Diagnosis', 'Treatment', 'Medication', 'Next appointment'],
        rows: (visits || []).map((visit: any) => [
          byId.get(visit.case_id)?.case_number,
          byId.get(visit.case_id)?.employee_name,
          visit.encounter_date,
          visit.provider_name || '',
          visit.provider_specialty || '',
          visit.facility || '',
          visit.diagnosis || '',
          visit.treatment || '',
          visit.medication || '',
          visit.next_appointment_date || ''
        ])
      }
    }
  }
}

export const isWcReportKey = (value: string): value is WcReportKey => WC_REPORTS.some(report => report.key === value)
