import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'

import FormPrintButton from '@/components/forms/FormPrintButton'
import { DVIR_PRINT_CSS, DvirPrintSheet } from '@/components/fleet/DvirPrintSheet'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { canOnVehicle, isDvirDriver, loadDvir } from '@/lib/forgeFleetDvirs'
import { getTenantContext } from '@/lib/forgeTenantContext'

export const metadata: Metadata = { title: 'Print DVIR' }

/** Port slice 11 (piece B): one DVIR on the paper layout. fleet.export for the vehicle, or the DVIR's driver. */
const DvirPrintPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) redirect('/dashboard')

  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const dvir = await loadDvir({ organizationId, dvirId: id })

  if (!dvir || !dvir.vehicle) notFound()

  const access = await getEffectiveTenantAccess({ organizationId, userId })
  const allowed = (await canOnVehicle({ access, key: 'fleet.export', organizationId, userId, vehicle: dvir.vehicle })) || (await isDvirDriver(dvir, userId))

  if (!allowed) notFound()

  return (
    <div className='flex flex-col gap-4'>
      <style>{DVIR_PRINT_CSS}</style>
      <div className='flex flex-wrap items-center justify-between gap-3' data-print-hide>
        <Button variant='outline' asChild>
          <Link href={`/fleet/dvirs/${dvir.id}`}>Back to DVIR</Link>
        </Button>
        <FormPrintButton />
      </div>
      <div data-dvir-print>
        <DvirPrintSheet dvir={dvir} companyName={context.activeOrganization.name} />
      </div>
    </div>
  )
}

export default DvirPrintPage
