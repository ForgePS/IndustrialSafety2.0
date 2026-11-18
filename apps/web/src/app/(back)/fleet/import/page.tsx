import type { Metadata } from 'next'
import { TbDownload } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import FleetImportForm from '@/components/fleet/FleetImportForm'
import VehiclePageHeader from '@/components/fleet/VehiclePageHeader'
import { allowedKeys } from '@/lib/forgeFleetVehicles'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Import Vehicles' }

/** Port slice 11: vehicle CSV import (fleet.create). */
const FleetImportPage = async () => {
  const context = await requireTenantPermission('fleet.create')

  return (
    <div className='flex flex-col gap-6'>
      <VehiclePageHeader
        active='vehicles'
        permissions={allowedKeys(context)}
        title='Import vehicles'
        subtitle='Upload a CSV in the Forge 1.0 fleet template or a Forge inventory export. Check it first: nothing is saved until you import.'
        actions={
          <Button variant='outline' asChild>
            {/* A file download, not a page: a plain anchor keeps the browser from client-routing it. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href='/fleet/import/template' download>
              <TbDownload />
              Download template
            </a>
          </Button>
        }
      />
      <Card>
        <CardContent className='text-textSecondary flex flex-col gap-1 p-4 text-sm'>
          <p>Vehicles are matched by VIN, then unit number, then license plate. A matched vehicle only changes in the columns your file has.</p>
          <p>Mileage is recorded as a reading. A mileage lower than the vehicle already has is not recorded. Drivers are matched by employee number or exact name.</p>
        </CardContent>
      </Card>
      <FleetImportForm />
    </div>
  )
}

export default FleetImportPage
