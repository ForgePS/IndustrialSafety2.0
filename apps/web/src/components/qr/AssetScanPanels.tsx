import Link from 'next/link'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getUserNames } from '@/lib/forgeLoto'
import { ASSET_STATUS_SOURCE_LABELS, assetStatusLabel } from '@/lib/forgeQrDestination'
import { personnelDisplayName } from '@/lib/forgeScanRules'

/**
 * Asset detail page: the service status history (out of service / return to service from scans, and every
 * other status change) and the asset's QR codes. Server component; loads its own rows.
 */
const AssetScanPanels = async ({
  organizationId,
  assetId,
  statusLabels,
  showQrCodes,
  canCreateQr
}: {
  organizationId: string
  assetId: string
  statusLabels: Record<string, string>
  showQrCodes: boolean
  canCreateQr: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: history, error: historyError }, { data: qrCodes, error: qrError }] = await Promise.all([
    supabase
      .from('forge_asset_status_history')
      .select('id, from_status, to_status, reason, notes, source, qr_code_id, actor_user_id, actor_personnel_id, actor_name, changed_at')
      .eq('organization_id', organizationId)
      .eq('asset_id', assetId)
      .order('changed_at', { ascending: false })
      .limit(50),
    showQrCodes
      ? supabase
          .from('forge_qr_codes')
          .select('id, qr_number, name, status, default_action, access_mode, scan_count, last_scanned_at')
          .eq('organization_id', organizationId)
          .eq('target_type', 'asset')
          .eq('target_id', assetId)
          .neq('status', 'archived')
          .order('qr_number')
      : Promise.resolve({ data: [], error: null })
  ])

  if (historyError) throw new Error('Unable to load service status history: ' + historyError.message)
  if (qrError) throw new Error('Unable to load QR codes: ' + qrError.message)

  const rows = history || []
  const personnelIds = Array.from(new Set(rows.map((row: any) => row.actor_personnel_id).filter(Boolean))) as string[]
  const qrIds = Array.from(new Set(rows.map((row: any) => row.qr_code_id).filter(Boolean))) as string[]

  const [personnelResult, qrResult, userNames] = await Promise.all([
    personnelIds.length
      ? supabase.from('forge_personnel').select('id, first_name, last_name, preferred_name').eq('organization_id', organizationId).in('id', personnelIds)
      : Promise.resolve({ data: [] }),
    qrIds.length
      ? supabase.from('forge_qr_codes').select('id, qr_number').eq('organization_id', organizationId).in('id', qrIds)
      : Promise.resolve({ data: [] }),
    getUserNames({ organizationId, userIds: rows.map((row: any) => row.actor_user_id) })
  ])

  const personnelNames = new Map<string, string>((personnelResult.data || []).map((person: any) => [person.id, personnelDisplayName(person)]))
  const qrNumbers = new Map<string, string>((qrResult.data || []).map((qr: any) => [qr.id, qr.qr_number]))

  const who = (row: any) =>
    row.actor_name ||
    (row.actor_personnel_id ? personnelNames.get(row.actor_personnel_id) : null) ||
    (row.actor_user_id ? userNames[row.actor_user_id] : null) ||
    'System'

  return (
    <>
      <Card data-asset-status-history>
        <CardHeader>
          <CardTitle>Service status history</CardTitle>
          <CardDescription>Every time this equipment was taken out of service, returned to service or changed status.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>How</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>QR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((row: any) => (
              <TableRow key={row.id}>
                <TableCell className='whitespace-nowrap'>{new Date(row.changed_at).toLocaleString()}</TableCell>
                <TableCell className='whitespace-nowrap'>
                  {assetStatusLabel(row.from_status, statusLabels)} → <span className='font-medium'>{assetStatusLabel(row.to_status, statusLabels)}</span>
                </TableCell>
                <TableCell>
                  <div>{row.reason || '—'}</div>
                  {row.notes ? <div className='text-textSecondary text-xs'>{row.notes}</div> : null}
                </TableCell>
                <TableCell>{ASSET_STATUS_SOURCE_LABELS[row.source] || row.source}</TableCell>
                <TableCell>{who(row)}</TableCell>
                <TableCell>
                  {row.qr_code_id && qrNumbers.get(row.qr_code_id)
                    ? showQrCodes
                      ? <Link className='text-primary hover:underline' href={'/qr/' + row.qr_code_id}>{qrNumbers.get(row.qr_code_id)}</Link>
                      : qrNumbers.get(row.qr_code_id)
                    : '—'}
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className='py-8 text-center'>No service status changes recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {showQrCodes ? (
        <Card data-asset-qr-codes>
          <CardHeader>
            <CardTitle>QR codes</CardTitle>
            <CardDescription>QR codes printed for this equipment. Scanning one opens the scan menu or the action it is set to.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            {(qrCodes || []).length ? (qrCodes || []).map((qr: any) => (
              <div key={qr.id} className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'>
                <div>
                  <Link className='text-primary font-semibold hover:underline' href={'/qr/' + qr.id}>{qr.qr_number} · {qr.name}</Link>
                  <div className='text-textSecondary mt-1 text-sm'>
                    {qr.default_action === 'scan_menu' ? 'Opens the scan menu' : 'Opens ' + String(qr.default_action).replaceAll('_', ' ')}
                    {' · '}{Number(qr.scan_count || 0)} scan{Number(qr.scan_count || 0) === 1 ? '' : 's'}
                    {qr.last_scanned_at ? ' · last ' + new Date(qr.last_scanned_at).toLocaleDateString() : ''}
                  </div>
                </div>
                <Badge size='sm' variant={qr.status === 'active' ? 'tonalSuccess' : 'secondary'}>{qr.status}</Badge>
              </div>
            )) : (
              <p className='text-textSecondary text-sm'>
                No QR codes for this equipment yet.
                {canCreateQr ? <> <Link className='text-primary hover:underline' href={'/qr/create?asset=' + assetId}>Create one</Link>.</> : null}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}

export default AssetScanPanels
