import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import AreaArchiveCard from '@/components/waypoint/AreaArchiveCard'
import AreaBriefing from '@/components/waypoint/AreaBriefing'
import AreaEquipmentPanel from '@/components/waypoint/AreaEquipmentPanel'
import { SCAN_ACCESS_MODE_LABELS, parseScanAccessMode, scanPath } from '@/lib/forgeScanRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import {
  loadAreaActivity,
  loadAreaBriefing,
  loadAreaForUser,
  loadAreaQrCodes,
  loadAssignableEquipment,
  locationInList,
  waypointLocationIds,
  type WaypointContext
} from '@/lib/forgeWaypoint'

export const metadata: Metadata = { title: 'Area' }

/** Forge Waypoint: one area, with its Area Card preview, equipment, Area Card QRs and history. */
const AreaPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = (await requireTenantPermission('waypoint.view')) as unknown as WaypointContext & {
    activeOrganization: { id: string; name: string }
  }
  const organizationId = context.activeOrganization.id
  const { id } = await params
  const area = await loadAreaForUser(context, id)

  if (!area) notFound()

  const archived = Boolean(area.archived_at)
  const canManage = locationInList(await waypointLocationIds(context, 'waypoint.manage'), area.location_id)
  const can = (key: string) => context.access.effective.some(item => item.permissionKey === key && item.allowed)
  const canCreateQr = !archived && can('qr_management.create')
  const canOpenQr = can('qr_management.view')

  const [briefing, qrCodes, assignable, activity] = await Promise.all([
    loadAreaBriefing(organizationId, area, { detailed: true }),
    loadAreaQrCodes(organizationId, area.id),
    canManage && !archived ? loadAssignableEquipment(organizationId, area) : Promise.resolve([]),
    loadAreaActivity(organizationId, area.id)
  ])

  return (
    <div className='flex flex-col gap-6' data-area-page={area.id}>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} / <Link href='/waypoint'>Waypoint</Link>
          </p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{area.name}</h1>
            {archived ? <Badge variant='secondary'>Archived</Badge> : null}
            {area.restricted_entry ? <Badge variant='destructive'>Restricted entry</Badge> : null}
          </div>
          <p className='text-textSecondary mt-2'>{[area.code, area.location_name].filter(Boolean).join(' · ')}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canManage && !archived ? (
            <Button variant='outline' asChild>
              <Link href={'/waypoint/' + area.id + '/edit'}>Edit area</Link>
            </Button>
          ) : null}
          {canCreateQr ? (
            <Button asChild>
              <Link href={'/qr/create?area=' + area.id} data-testid='create-area-card'>
                {qrCodes.length ? 'Add another Area Card QR' : 'Create Area Card QR'}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]'>
        <Card>
          <CardHeader>
            <CardTitle>Area Card preview</CardTitle>
            <CardDescription>
              What someone sees after scanning at the entrance (signed in or with an employee number).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AreaBriefing {...briefing} />
          </CardContent>
        </Card>

        <div className='flex flex-col gap-6'>
          <AreaEquipmentPanel
            areaId={area.id}
            equipment={briefing.equipment || []}
            assignable={assignable}
            canManage={canManage && !archived}
          />

          <Card data-testid='area-qr-codes'>
            <CardHeader>
              <CardTitle>Area Card QR codes</CardTitle>
              <CardDescription>
                Print one and post it at each entrance. Scanning opens the brief, then the scan menu (report an issue,
                inspections, forms).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {qrCodes.length ? (
                <ul className='divide-y text-sm'>
                  {qrCodes.map(qr => (
                    <li key={qr.id} className='flex flex-wrap items-center justify-between gap-3 py-2'>
                      <span>
                        {canOpenQr ? (
                          <Link href={'/qr/' + qr.id} className='text-primary font-medium hover:underline'>
                            {qr.qr_number} · {qr.name}
                          </Link>
                        ) : (
                          <span className='font-medium'>
                            {qr.qr_number} · {qr.name}
                          </span>
                        )}
                        <span className='text-textSecondary block text-xs'>
                          {SCAN_ACCESS_MODE_LABELS[parseScanAccessMode(qr.access_mode)]} · {qr.scan_count || 0} scans
                          {qr.status !== 'active' ? ' · ' + qr.status : ''}
                        </span>
                      </span>
                      {qr.status === 'active' ? (
                        <Link
                          href={scanPath(qr.token)}
                          className='text-primary text-sm hover:underline'
                          target='_blank'
                        >
                          Open Area Card
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-textSecondary text-sm'>
                  No Area Card yet.{canCreateQr ? ' Create one to post at the entrance.' : ''}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length ? (
                <ul className='flex flex-col gap-2 text-sm' data-testid='area-activity'>
                  {activity.map(item => (
                    <li key={item.id}>
                      <span className='text-textSecondary'>{new Date(item.created_at).toLocaleString()} · </span>
                      {item.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-textSecondary text-sm'>No history yet.</p>
              )}
            </CardContent>
          </Card>

          {canManage ? <AreaArchiveCard areaId={area.id} archived={archived} /> : null}
        </div>
      </div>
    </div>
  )
}

export default AreaPage
