import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import { getDotSettings } from '@/lib/forgeDot'
import { DOT_DOCUMENT_GROUP_LABELS, DOT_DOCUMENTS } from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import DotSettingsForm from './DotSettingsForm'

export const metadata: Metadata = { title: 'DOT Settings' }

const DotSettingsPage = async () => {
  const context = await requireTenantPermission('dot.settings')
  const settings = await getDotSettings(context.activeOrganization.id)

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader active='settings' allowed={allowedFrom(context)} />
      <Card className='max-w-4xl'>
        <CardHeader>
          <CardTitle>DOT settings</CardTitle>
          <CardDescription>These apply to every driver file and the company-driver roster in this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <DotSettingsForm
            documents={DOT_DOCUMENTS.map(item => ({ key: item.key, label: item.label, group: DOT_DOCUMENT_GROUP_LABELS[item.group] }))}
            initial={{
              hiddenDocumentTypes: settings.hidden_document_types,
              dotDriversAreCompanyDrivers: settings.dot_drivers_are_company_drivers,
              insurerName: settings.insurer_name || '',
              insurerEmail: settings.insurer_email || '',
              mvrSamplePercent: settings.mvr_sample_percent
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default DotSettingsPage
