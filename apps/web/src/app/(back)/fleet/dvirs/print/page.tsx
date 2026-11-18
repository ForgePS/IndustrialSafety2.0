import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'

import FormPrintButton from '@/components/forms/FormPrintButton'
import { DVIR_PRINT_CSS, DvirPrintSheet } from '@/components/fleet/DvirPrintSheet'
import { loadVehicle } from '@/lib/forgeFleetAccess'
import { vehicleDisplayName } from '@/lib/forgeFleetRules'
import { parseIsoDate } from '@/lib/forgeFleetDvirRules'
import { canOnVehicle, loadDvirDay } from '@/lib/forgeFleetDvirs'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'DVIR day sheet' }

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || ''

/** Port slice 11 (piece B): every DVIR for one vehicle on one day (?vehicle=<id>&date=YYYY-MM-DD), one per page. */
const DvirDayPrintPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('fleet.export')
  const organizationId = context.activeOrganization.id
  const params = await searchParams
  const vehicleId = one(params.vehicle)
  const date = parseIsoDate(one(params.date)) || new Date().toISOString().slice(0, 10)

  const vehicle = /^[0-9a-f-]{36}$/i.test(vehicleId) ? await loadVehicle({ organizationId, vehicleId }) : null

  if (!vehicle || !(await canOnVehicle({ access: context.access, key: 'fleet.export', organizationId, userId: context.user.id, vehicle }))) notFound()

  const dvirs = await loadDvirDay({ organizationId, vehicleId: vehicle.id, date })

  return (
    <div className='flex flex-col gap-4'>
      <style>{DVIR_PRINT_CSS}</style>
      <div className='flex flex-wrap items-end justify-between gap-3' data-print-hide>
        <div>
          <h1 className='text-textPrimary text-2xl font-bold'>DVIRs for {vehicleDisplayName(vehicle)}</h1>
          <form method='get' className='mt-2 flex items-center gap-2'>
            <input type='hidden' name='vehicle' value={vehicle.id} />
            <input type='date' name='date' defaultValue={date} className='border-input bg-background h-10 rounded-md border px-3 text-sm' aria-label='Date' />
            <Button type='submit' variant='outline'>
              Show
            </Button>
          </form>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' asChild>
            <Link href={`/fleet/dvirs?vehicle=${vehicle.id}`}>Back to DVIRs</Link>
          </Button>
          {dvirs.length ? <FormPrintButton /> : null}
        </div>
      </div>
      {dvirs.length ? (
        <div data-dvir-print className='flex flex-col gap-6' data-testid='dvir-day-sheet' data-count={dvirs.length}>
          {dvirs.map(dvir => (
            <DvirPrintSheet key={dvir.id} dvir={dvir} companyName={context.activeOrganization.name} />
          ))}
        </div>
      ) : (
        <p className='text-textSecondary' data-testid='dvir-day-empty'>
          No DVIRs were recorded for this vehicle on {date}.
        </p>
      )}
    </div>
  )
}

export default DvirDayPrintPage
