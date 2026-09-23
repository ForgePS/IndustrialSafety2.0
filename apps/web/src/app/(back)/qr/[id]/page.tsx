import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'
import ManagedQrForm from '../ManagedQrForm'
import QrArchiveCard from '../QrArchiveCard'
import QrVisualCard from '../QrVisualCard'
import type { QrFormValues } from '../actions'
import { getScopedAssets } from '@/lib/forgeAssets'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { generateForgeQrSvg } from '@/lib/forgeQrSvg'
import { getForgeQrScanUrl, getQrScanHistory, qrCodeWithinScope } from '@/lib/forgeQr'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Managed QR Code' }

const QrCodeDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('qr_management.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: qrCode },
    form,
    statusLookup,
    actionLookup
  ] = await Promise.all([
    supabase
      .from('forge_qr_codes')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle(),
    getEffectiveForm({ organizationId, formKey: 'qr.profile' }),
    getEffectiveLookup({ organizationId, lookupKey: 'qr.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'qr.action' })
  ])

  if (!qrCode || !form) notFound()

  const mayView = await qrCodeWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    qrCode
  })

  if (!mayView) notFound()

  const { data: targetAsset } = await supabase
    .from('forge_assets')
    .select('id, asset_number, name, status, retired_at')
    .eq('organization_id', organizationId)
    .eq('id', qrCode.target_id)
    .maybeSingle()

  const permissions = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissions.get('qr_management.edit')
  const rotatePermission = permissions.get('qr_management.rotate_token')
  const deletePermission = permissions.get('qr_management.delete')
  const scanPermission = permissions.get('qr_management.view_scans')

  const within = async (permission: any) =>
    permission
      ? qrCodeWithinScope({
          organizationId,
          userId: context.user.id,
          scope: permission.scope,
          qrCode
        })
      : false

  const [canEdit, canRotate, canArchive, canViewScans, editableAssets] = await Promise.all([
    within(editPermission),
    within(rotatePermission),
    within(deletePermission),
    within(scanPermission),
    editPermission
      ? getScopedAssets({
          organizationId,
          userId: context.user.id,
          permission: editPermission,
          includeRetired: true
        })
      : Promise.resolve(targetAsset ? [targetAsset] : [])
  ])

  const scans = canViewScans
    ? await getQrScanHistory({ organizationId, qrCodeId: qrCode.id, limit: 100 })
    : []

  const scanUrl = getForgeQrScanUrl(qrCode.token)
  const svg = generateForgeQrSvg(scanUrl)

  const statusLabels = Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))
  const actionLabels = Object.fromEntries(actionLookup.options.map(option => [option.key, option.label]))

  const expiresAt = qrCode.expires_at
    ? String(qrCode.expires_at).slice(0, 16)
    : ''

  const values: QrFormValues = {
    name: qrCode.name,
    description: qrCode.description || '',
    asset_id: qrCode.target_id,
    default_action: qrCode.default_action,
    status: qrCode.status,
    expires_at: expiresAt
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / QR Management</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{qrCode.name}</h1>
            <Badge size='sm' variant={qrCode.status === 'active' ? 'tonalSuccess' : 'secondary'}>
              {statusLabels[qrCode.status] || qrCode.status}
            </Badge>
          </div>
          <p className='text-textSecondary mt-2'>{qrCode.qr_number} · {targetAsset ? targetAsset.asset_number + ' · ' + targetAsset.name : 'Missing target asset'}</p>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Default Action</CardDescription></CardHeader>
          <CardContent><div className='font-semibold'>{actionLabels[qrCode.default_action] || qrCode.default_action}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Total Scans</CardDescription></CardHeader>
          <CardContent><div className='text-2xl font-semibold'>{Number(qrCode.scan_count || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Last Scan</CardDescription></CardHeader>
          <CardContent><div className='font-semibold'>{qrCode.last_scanned_at ? new Date(qrCode.last_scanned_at).toLocaleString() : 'Never'}</div></CardContent>
        </Card>
      </div>

      {qrCode.status !== 'archived' ? (
        <QrVisualCard
          qrCodeId={qrCode.id}
          qrNumber={qrCode.qr_number}
          name={qrCode.name}
          scanUrl={scanUrl}
          svg={svg}
          canRotate={Boolean(canRotate)}
        />
      ) : null}

      <ManagedQrForm
        form={form}
        qrCodeId={qrCode.id}
        initialValues={values}
        readOnly={!canEdit || qrCode.status === 'archived'}
        assets={(editableAssets || []).map((asset: any) => ({
          id: asset.id,
          label: asset.asset_number + ' · ' + asset.name
        }))}
      />

      {canViewScans ? (
        <Card>
          <CardHeader>
            <CardTitle>Scan History</CardTitle>
            <CardDescription>Recent scan events. Forge does not store a raw scanner IP address in this ledger.</CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scanned</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>User Agent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.length ? scans.map((scan: any) => (
                <TableRow key={scan.id}>
                  <TableCell>{new Date(scan.scanned_at).toLocaleString()}</TableCell>
                  <TableCell>{scan.auth_user_id ? 'Authenticated' : 'Not signed in'}</TableCell>
                  <TableCell className='font-mono text-xs'>{scan.destination_path}</TableCell>
                  <TableCell className='max-w-md truncate'>{scan.user_agent || '—'}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={4} className='py-8 text-center'>This QR code has not been scanned yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {canArchive && qrCode.status !== 'archived' ? <QrArchiveCard qrCodeId={qrCode.id} /> : null}
    </div>
  )
}

export default QrCodeDetailPage
