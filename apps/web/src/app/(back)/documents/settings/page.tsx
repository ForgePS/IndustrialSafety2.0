import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { DocumentPageHeader } from '@/components/documents/DocumentPageHeader'
import DocumentSettingsForm from '@/components/documents/DocumentSettingsForm'
import { loadDocumentSettings } from '@/lib/forgeDocumentAccess'
import { allowedKeys } from '@/lib/forgeDocumentLibraryServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Document Control Settings' }

const DocumentSettingsPage = async () => {
  const context = await requireTenantPermission('documents.settings')
  const settings = await loadDocumentSettings(context.activeOrganization.id)

  return (
    <div className='flex flex-col gap-6'>
      <DocumentPageHeader active='settings' permissions={allowedKeys(context)} subtitle='Who can approve versions and how often documents are reviewed.' />
      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle>Document Control settings</CardTitle>
          <CardDescription>These apply to every document in this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentSettingsForm
            initial={{
              allowSelfApproval: settings.allow_self_approval,
              defaultReviewIntervalMonths: String(settings.default_review_interval_months),
              reviewWarningDays: String(settings.review_warning_days)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default DocumentSettingsPage
