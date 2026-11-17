import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getScopedCorrectiveActions } from '@/lib/forgeCorrectiveActions'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import type { CapaReportLabels, CapaReportRecord } from '@/lib/forgeCapaReportRules'

/** CAPAs for the report, through the same scoped loader as the CAPA list (archived left out). */
export const getCapaReportData = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}): Promise<{ records: CapaReportRecord[]; labels: CapaReportLabels }> => {
  const [rows, statusLookup, severityLookup] = await Promise.all([
    getScopedCorrectiveActions({ organizationId, userId, permission }),
    getEffectiveLookup({ organizationId, lookupKey: 'corrective_actions.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'corrective_actions.severity' })
  ])

  const records: CapaReportRecord[] = rows.map((row: any) => ({
    id: row.id,
    action_number: row.action_number,
    title: row.title,
    status: row.status,
    severity: row.severity,
    source_type: row.source_type,
    created_at: row.created_at,
    due_at: row.due_at,
    closed_at: row.closed_at,
    completed_at: row.completed_at,
    ownerName: row.forge_personnel ? [row.forge_personnel.first_name, row.forge_personnel.last_name].filter(Boolean).join(' ') || null : null,
    locationName: row.locations?.name || null
  }))

  return {
    records,
    labels: {
      status: Object.fromEntries(statusLookup.options.map(option => [option.key, option.label])),
      severity: Object.fromEntries(severityLookup.options.map(option => [option.key, option.label]))
    }
  }
}
