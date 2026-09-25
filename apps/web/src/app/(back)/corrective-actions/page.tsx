import type { Metadata } from 'next'
import CorrectiveActionList from './CorrectiveActionList'
import type { CorrectiveActionListItem } from './CorrectiveActionList'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getScopedCorrectiveActions } from '@/lib/forgeCorrectiveActions'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Corrective Actions' }

const CorrectiveActionsPage = async () => {
  const context = await requireTenantPermission('corrective_actions.view')
  const organizationId = context.activeOrganization.id

  const [rows, statusLookup, severityLookup, typeLookup] = await Promise.all([
    getScopedCorrectiveActions({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'corrective_actions.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'corrective_actions.severity' }),
    getEffectiveLookup({ organizationId, lookupKey: 'corrective_actions.type' })
  ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'corrective_actions.create' && item.allowed
  )

  const records: CorrectiveActionListItem[] = rows.map((record: any) => ({
    id: record.id,
    action_number: record.action_number,
    title: record.title,
    status: record.status,
    severity: record.severity,
    action_type: record.action_type,
    due_at: record.due_at,
    assigneeName: record.forge_personnel
      ? [record.forge_personnel.first_name, record.forge_personnel.last_name].filter(Boolean).join(' ')
      : null,
    locationName: record.locations?.name || null,
    source_type: record.source_type,
    source_reference: record.source_reference,
    linked_task_id: record.linked_task_id
  }))

  return (
    <CorrectiveActionList
      records={records}
      canCreate={canCreate}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      severityLabels={Object.fromEntries(severityLookup.options.map(option => [option.key, option.label]))}
      typeLabels={Object.fromEntries(typeLookup.options.map(option => [option.key, option.label]))}
    />
  )
}

export default CorrectiveActionsPage
