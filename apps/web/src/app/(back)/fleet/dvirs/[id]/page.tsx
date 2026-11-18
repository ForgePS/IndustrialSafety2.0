import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TbPrinter } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { DvirCertifyPanel, DvirReviewPanel } from '@/components/fleet/DvirFollowUpPanel'
import { DvirChecklistView, DvirSignatureHistory } from '@/components/fleet/DvirView'
import FleetTabs from '@/components/fleet/FleetTabs'
import { DVIR_FOLLOW_UP_LABELS, DVIR_TRIP_LABELS, dvirFollowUp, vehicleDisplayName } from '@/lib/forgeFleetRules'
import { DVIR_STATUS_LABELS } from '@/lib/forgeFleetDvirRules'
import { canOnVehicle, isDvirDriver, loadDvir, memberIdentity } from '@/lib/forgeFleetDvirs'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'DVIR' }

const DEFECT_STATUS: Record<string, string> = { open: 'Open', corrected: 'Corrected', not_needed: 'No correction needed' }

/**
 * Port slice 11 (piece B): one DVIR, read only, with the follow-up panels: mechanic certification while it
 * has open defects, the next driver's review once certified.
 */
const DvirPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('fleet.view')
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const dvir = await loadDvir({ organizationId, dvirId: id })

  if (!dvir || !dvir.vehicle) notFound()

  const vehicle = dvir.vehicle
  const driver = await isDvirDriver(dvir, userId)
  const check = (key: string) => canOnVehicle({ access: context.access, key, organizationId, userId, vehicle })
  const [canView, canCertify, canReview, canExport] = await Promise.all([check('fleet.view'), check('fleet.dvir_certify'), check('fleet.dvir'), check('fleet.export')])

  if (!canView && !driver) notFound()

  const permissions = context.access.effective.filter(item => item.allowed).map(item => item.permissionKey)
  const identity = await memberIdentity(organizationId, userId)
  const followUp = dvirFollowUp(dvir)
  const lowerOdometer = dvir.odometer != null && !dvir.odometerApplied

  return (
    <div className='flex flex-col gap-6' data-dvir-page={dvir.dvir_number} data-status={dvir.status}>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} / Fleet / <Link href='/fleet/dvirs'>DVIRs</Link>
          </p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>
            {DVIR_TRIP_LABELS[dvir.trip_type as 'pre_trip']} DVIR {dvir.dvir_number}
          </h1>
          <p className='text-textSecondary mt-2'>
            <Link href={`/fleet/vehicles/${vehicle.id}`} className='text-primary hover:underline'>
              {vehicleDisplayName(vehicle)}
            </Link>{' '}
            · {dvir.inspection_date} · {dvir.driver_name}
          </p>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <Badge variant={dvir.status === 'closed' ? 'tonalSuccess' : dvir.status === 'open' ? 'destructive' : 'tonalPrimary'} data-testid='dvir-status'>
              {DVIR_STATUS_LABELS[dvir.status] || dvir.status}
            </Badge>
            <span className='text-textSecondary text-sm'>{DVIR_FOLLOW_UP_LABELS[followUp]}</span>
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canExport || driver ? (
            <Button variant='outline' asChild>
              <Link href={`/fleet/dvirs/${dvir.id}/print`} data-testid='dvir-print-link'>
                <TbPrinter />
                Print
              </Link>
            </Button>
          ) : null}
          {canExport ? (
            <Button variant='outline' asChild>
              <Link href={`/fleet/dvirs/print?vehicle=${vehicle.id}&date=${dvir.inspection_date}`}>Day sheet</Link>
            </Button>
          ) : null}
          <Button variant='outline' asChild>
            <Link href={`/fleet/dvirs?vehicle=${vehicle.id}`}>All DVIRs for this vehicle</Link>
          </Button>
        </div>
      </div>

      <FleetTabs active='dvirs' permissions={permissions} />

      {dvir.status === 'open' && canCertify ? <DvirCertifyPanel dvirId={dvir.id} defaultName={identity.name} hasRepair={dvir.repair?.status === 'open'} /> : null}
      {dvir.status === 'needs_review' && canReview ? <DvirReviewPanel dvirId={dvir.id} defaultName={identity.name} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Report</CardTitle>
          <CardDescription>Submitted DVIRs cannot be changed. The mechanic and the next driver add their signatures below.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <dl className='grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4'>
            <div>
              <dt className='text-textSecondary'>Vehicle number</dt>
              <dd className='font-medium'>{vehicle.vehicle_number}</dd>
            </div>
            <div>
              <dt className='text-textSecondary'>Trailer number(s)</dt>
              <dd className='font-medium'>{dvir.trailer_numbers || '—'}</dd>
            </div>
            <div>
              <dt className='text-textSecondary'>Odometer</dt>
              <dd className='font-medium' data-testid='dvir-odometer'>
                {dvir.odometer != null ? dvir.odometer.toLocaleString() : '—'}
                {lowerOdometer ? <span className='block text-xs font-normal text-amber-700'>Lower than the vehicle&apos;s mileage at the time, so the mileage was not changed.</span> : null}
              </dd>
            </div>
            <div>
              <dt className='text-textSecondary'>Location</dt>
              <dd className='font-medium'>{dvir.locations?.name || '—'}</dd>
            </div>
          </dl>
          <p className='text-sm' data-testid='dvir-condition'>
            {dvir.condition_satisfactory ? 'The driver marked the condition of the vehicle satisfactory.' : 'The driver did not mark the condition satisfactory.'}
          </p>
          {dvir.remarks ? (
            <div className='text-sm'>
              <div className='text-textSecondary'>Remarks</div>
              <p className='whitespace-pre-wrap'>{dvir.remarks}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {dvir.defects.length ? (
        <Card data-testid='dvir-defects'>
          <CardHeader>
            <CardTitle>Defects</CardTitle>
            {dvir.repair ? (
              <CardDescription>
                Repair{' '}
                <Link href={`/fleet/maintenance/${dvir.repair.id}`} className='text-primary hover:underline'>
                  {dvir.repair.maintenance_number}
                </Link>{' '}
                · {dvir.repair.status}
                {dvir.repair.completed_on ? ` on ${dvir.repair.completed_on}` : ''}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <ul className='flex flex-col gap-2 text-sm'>
              {dvir.defects.map((defect: any) => (
                <li key={defect.id} className='flex flex-wrap justify-between gap-2 rounded-md border p-3' data-defect={defect.item_id} data-defect-status={defect.status}>
                  <span>
                    <span className='font-semibold'>
                      {defect.section === 'trailer' ? 'Trailer ' : ''}
                      {defect.item_label}
                    </span>
                    : {defect.notes}
                  </span>
                  <span className='text-textSecondary'>{DEFECT_STATUS[defect.status] || defect.status}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <DvirChecklistView items={dvir.items || []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signatures</CardTitle>
          <CardDescription>Who signed what, in order.</CardDescription>
        </CardHeader>
        <CardContent>
          <DvirSignatureHistory dvir={dvir} />
        </CardContent>
      </Card>
    </div>
  )
}

export default DvirPage
