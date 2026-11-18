import type { Metadata } from 'next'
import { TbDownload } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import VehiclePageHeader from '@/components/fleet/VehiclePageHeader'
import { allowedKeys } from '@/lib/forgeFleetVehicles'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Fleet Reports' }

const REPORTS = [
  { href: '/fleet/reports/inventory', title: 'Fleet inventory', description: 'Every vehicle in the fleet with registration, insurance, filing, driver and meter details. Re-imports with the CSV import.' },
  { href: '/fleet/reports/removed', title: 'Removed vehicles', description: 'Vehicles removed, sold or disposed of, with the disposition date and notes.' }
]

/** Port slice 11: fleet CSV reports (fleet.export). Limited to the vehicles you can see. */
const FleetReportsPage = async () => {
  const context = await requireTenantPermission('fleet.export')

  return (
    <div className='flex flex-col gap-6'>
      <VehiclePageHeader active='reports' permissions={allowedKeys(context)} subtitle='CSV downloads of the vehicles you can see.' />
      <div className='grid gap-4 md:grid-cols-2'>
        {REPORTS.map(report => (
          <Card key={report.href}>
            <CardHeader>
              <CardTitle>{report.title}</CardTitle>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant='outline' asChild>
                <a href={report.href} data-report={report.href} download>
                  <TbDownload />
                  Download CSV
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default FleetReportsPage
