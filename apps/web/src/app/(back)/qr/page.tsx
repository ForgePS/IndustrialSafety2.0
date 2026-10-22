import type { Metadata } from 'next'
import QrList from './QrList'
import type { QrListItem } from './QrList'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getScopedQrCodes } from '@/lib/forgeQr'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'QR Management' }

const QrManagementPage = async () => {
  const context = await requireTenantPermission('qr_management.view')
  const organizationId = context.activeOrganization.id

  const [records, statusLookup, actionLookup] = await Promise.all([
    getScopedQrCodes({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'qr.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'qr.action' })
  ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'qr_management.create' && item.allowed
  )

  const codes: QrListItem[] = records.map((record: any) => ({
    id: record.id,
    qr_number: record.qr_number,
    name: record.name,
    description: record.description,
    status: record.status,
    default_action: record.default_action,
    scan_count: Number(record.scan_count || 0),
    last_scanned_at: record.last_scanned_at,
    targetAssetName: record.targetAsset?.name || null,
    targetAssetNumber: record.targetAsset?.asset_number || null
  }))

  return (
    <QrList
      codes={codes}
      canCreate={canCreate}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      actionLabels={Object.fromEntries(actionLookup.options.map(option => [option.key, option.label]))}
    />
  )
}

export default QrManagementPage
