import Link from 'next/link'
import type { Metadata } from 'next'
import { TbPlus, TbPrinter } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import FleetTabs from '@/components/fleet/FleetTabs'
import { DVIR_TRIP_LABELS, dvirFollowUp, DVIR_FOLLOW_UP_LABELS, vehicleDisplayName } from '@/lib/forgeFleetRules'
import { DVIR_STATUS_LABELS } from '@/lib/forgeFleetDvirRules'
import { dvirVehicleOptions, grantOf, listDvirs } from '@/lib/forgeFleetDvirs'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'DVIRs' }

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || ''

const selectClass = 'border-input bg-background h-10 rounded-md border px-3 text-sm'

const statusVariant = (status: string) => (status === 'closed' ? 'tonalSuccess' : status === 'open' ? 'destructive' : 'tonalPrimary')

/**
 * Port slice 11 (piece B): every DVIR the viewer can see (vehicles in their fleet.view scope, plus DVIRs they
 * signed as the driver), newest first. ?vehicle= comes from the vehicle page.
 */
const DvirListPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('fleet.view')
  const organizationId = context.activeOrganization.id
  const params = await searchParams
  const permissions = context.access.effective.filter(item => item.allowed).map(item => item.permissionKey)

  const filters = { vehicleId: one(params.vehicle), status: one(params.status), trip: one(params.trip), from: one(params.from), to: one(params.to) }
  const scope = context.permission.scope ?? null

  const [rows, vehicles] = await Promise.all([
    listDvirs({ organizationId, userId: context.user.id, scope, filters }),
    dvirVehicleOptions({ organizationId, userId: context.user.id, scope })
  ])

  const canSubmit = Boolean(grantOf(context.access, 'fleet.dvir'))
  const canExport = Boolean(grantOf(context.access, 'fleet.export'))
  const vehicle = vehicles.find(item => item.id === filters.vehicleId)

  const quick = (status: string) => {
    const next = new URLSearchParams()

    if (filters.vehicleId) next.set('vehicle', filters.vehicleId)
    if (status) next.set('status', status)

    const query = next.toString()

    return `/fleet/dvirs${query ? `?${query}` : ''}`
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Fleet</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Driver Vehicle Inspection Reports</h1>
          <p className='text-textSecondary mt-2'>
            Pre-trip and post-trip DVIRs{vehicle ? ` for ${vehicleDisplayName(vehicle)}` : ''}. Defects need a mechanic&apos;s certification and the next driver&apos;s review.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canExport && vehicle ? (
            <Button variant='outline' asChild>
              <Link href={`/fleet/dvirs/print?vehicle=${vehicle.id}&date=${filters.to || filters.from || new Date().toISOString().slice(0, 10)}`}>
                <TbPrinter />
                Print day sheet
              </Link>
            </Button>
          ) : null}
          {canSubmit ? (
            <Button asChild>
              <Link href={`/fleet/dvirs/new${filters.vehicleId ? `?vehicle=${filters.vehicleId}` : ''}`} data-testid='dvir-new'>
                <TbPlus />
                New DVIR
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <FleetTabs active='dvirs' permissions={permissions} />

      <div className='flex flex-wrap gap-2' data-testid='dvir-quick-filters'>
        {[
          { label: 'All', status: '' },
          { label: 'Needs mechanic', status: 'open' },
          { label: 'Needs review', status: 'needs_review' },
          { label: 'Any follow-up', status: 'follow_up' },
          { label: 'Closed', status: 'closed' }
        ].map(item => (
          <Button key={item.label} size='sm' variant={filters.status === item.status ? 'default' : 'outline'} asChild>
            <Link href={quick(item.status)}>{item.label}</Link>
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className='pt-6'>
          <form method='get' className='grid gap-3 md:grid-cols-3 xl:grid-cols-6' data-dvir-filters>
            <div className='flex flex-col gap-1 xl:col-span-2'>
              <Label htmlFor='dvir-vehicle'>Vehicle</Label>
              <select id='dvir-vehicle' name='vehicle' defaultValue={filters.vehicleId} className={selectClass}>
                <option value=''>All vehicles</option>
                {vehicles.map(item => (
                  <option key={item.id} value={item.id}>
                    {vehicleDisplayName(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='dvir-status'>Status</Label>
              <select id='dvir-status' name='status' defaultValue={filters.status} className={selectClass}>
                <option value=''>Any status</option>
                <option value='follow_up'>Any follow-up</option>
                <option value='open'>Needs mechanic</option>
                <option value='needs_review'>Needs driver review</option>
                <option value='closed'>Closed</option>
              </select>
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='dvir-trip'>Trip</Label>
              <select id='dvir-trip' name='trip' defaultValue={filters.trip} className={selectClass}>
                <option value=''>Both</option>
                <option value='pre_trip'>Pre-trip</option>
                <option value='post_trip'>Post-trip</option>
              </select>
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='dvir-from'>From</Label>
              <Input id='dvir-from' name='from' type='date' defaultValue={filters.from} />
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='dvir-to'>To</Label>
              <Input id='dvir-to' name='to' type='date' defaultValue={filters.to} />
            </div>
            <div className='flex items-end gap-2 xl:col-span-6'>
              <Button type='submit'>Apply filters</Button>
              <Button variant='ghost' asChild>
                <Link href='/fleet/dvirs'>Clear</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!rows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No DVIRs</CardTitle>
            <CardDescription>No DVIRs match these filters.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className='pt-6'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Trip</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Defects</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id} data-dvir-row={row.dvir_number} data-status={row.status}>
                    <TableCell className='font-medium'>
                      <Link href={`/fleet/dvirs/${row.id}`} className='text-primary hover:underline'>
                        {row.dvir_number}
                      </Link>
                    </TableCell>
                    <TableCell>{row.vehicle ? vehicleDisplayName(row.vehicle) : '—'}</TableCell>
                    <TableCell>{row.inspection_date}</TableCell>
                    <TableCell>{DVIR_TRIP_LABELS[row.trip_type as 'pre_trip'] || row.trip_type}</TableCell>
                    <TableCell>
                      {row.driver_name}
                      {row.submitted_via === 'scan' ? <div className='text-textSecondary text-xs'>From QR scan</div> : null}
                    </TableCell>
                    <TableCell>{row.defectCount || '—'}</TableCell>
                    <TableCell>
                      <Badge size='sm' variant={statusVariant(row.status)}>
                        {DVIR_STATUS_LABELS[row.status] || row.status}
                      </Badge>
                      <div className='text-textSecondary mt-1 text-xs'>{DVIR_FOLLOW_UP_LABELS[dvirFollowUp({ status: row.status, mechanic_signature: row.mechanic_signed_at })]}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length >= 200 ? <p className='text-textSecondary mt-3 text-sm'>Showing the newest 200. Narrow the filters to see older DVIRs.</p> : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default DvirListPage
