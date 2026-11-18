import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import FleetSettingsForm from '@/components/fleet/FleetSettingsForm'
import { FleetPageHeader, allowedKeys } from '@/components/fleet/MaintenanceBadges'
import { loadFleetSettings } from '@/lib/forgeFleetAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Fleet Settings' }

const FleetSettingsPage = async () => {
  const context = await requireTenantPermission('fleet.settings')
  const settings = await loadFleetSettings(context.activeOrganization.id)

  return (
    <div className='flex flex-col gap-6'>
      <FleetPageHeader active='settings' permissions={allowedKeys(context)} title='Fleet' subtitle='How DVIR defects are handled and when reminders go out.' />
      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle>Fleet settings</CardTitle>
          <CardDescription>These apply to every vehicle in this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <FleetSettingsForm
            initial={{
              defectOutOfService: settings.defect_out_of_service,
              defectOpensRepair: settings.defect_opens_repair,
              renewalWarningDays: String(settings.renewal_warning_days),
              dvirRetentionDays: String(settings.dvir_retention_days)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default FleetSettingsPage
