import Link from 'next/link'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import { TbPlus, TbQrcode } from 'react-icons/tb'

/**
 * Port slice 11: the vehicle page's "QR codes" card. Lists the vehicle's QR codes (qr_management.view) and
 * offers "Create QR" (qr_management.create). Server component; loads its own rows. The caller has already
 * checked the vehicle is within the viewer's fleet scope.
 */
const VehicleQrCard = async ({
  vehicleId,
  organizationId,
  canView,
  canCreate
}: {
  vehicleId: string
  organizationId: string
  canView: boolean
  canCreate: boolean
}) => {
  if (!canView && !canCreate) return null

  const supabase = createServiceRoleClient() as any

  const { data, error } = canView
    ? await supabase
        .from('forge_qr_codes')
        .select('id, qr_number, name, status, default_action, access_mode, scan_count, last_scanned_at')
        .eq('organization_id', organizationId)
        .eq('target_type', 'vehicle')
        .eq('target_id', vehicleId)
        .neq('status', 'archived')
        .order('qr_number')
    : { data: [], error: null }

  if (error) throw new Error('Unable to load QR codes: ' + error.message)

  const rows = (data || []) as any[]

  return (
    <Card data-vehicle-qr-codes>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-2'>
        <div>
          <CardTitle>QR codes</CardTitle>
          <CardDescription>Stickers for this vehicle. Scanning one opens the scan menu: DVIRs, report an issue, service status and history.</CardDescription>
        </div>
        {canCreate ? (
          <Button asChild size='sm' variant='outline'>
            <Link href={'/qr/create?vehicle=' + vehicleId} data-vehicle-create-qr>
              <TbPlus className='size-4' /> Create QR
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {!canView ? (
          <p className='text-textSecondary text-sm'>You can create QR codes for this vehicle, but not view the existing ones.</p>
        ) : rows.length ? (
          rows.map(qr => (
            <div key={qr.id} className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3' data-vehicle-qr-row>
              <div className='flex items-start gap-2'>
                <TbQrcode className='text-textSecondary mt-0.5 size-5 shrink-0' />
                <div>
                  <Link className='text-primary font-semibold hover:underline' href={'/qr/' + qr.id}>
                    {qr.qr_number} · {qr.name}
                  </Link>
                  <div className='text-textSecondary mt-1 text-sm'>
                    Opens the scan menu
                    {' · '}
                    {Number(qr.scan_count || 0)} scan{Number(qr.scan_count || 0) === 1 ? '' : 's'}
                    {qr.last_scanned_at ? ' · last ' + new Date(qr.last_scanned_at).toLocaleDateString() : ''}
                  </div>
                </div>
              </div>
              <Badge size='sm' variant={qr.status === 'active' ? 'tonalSuccess' : 'secondary'}>
                {qr.status}
              </Badge>
            </div>
          ))
        ) : (
          <p className='text-textSecondary text-sm'>No QR codes for this vehicle yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default VehicleQrCard
