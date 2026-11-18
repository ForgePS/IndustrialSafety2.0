import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DocumentForm from '@/components/documents/DocumentForm'
import { DocumentPageHeader } from '@/components/documents/DocumentPageHeader'
import { loadDocumentSettings, type DocumentContext } from '@/lib/forgeDocumentAccess'
import { allowedKeys, loadDocumentFormOptions } from '@/lib/forgeDocumentLibraryServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'New Document' }

const NewDocumentPage = async ({ searchParams }: { searchParams: Promise<{ folder?: string }> }) => {
  const context = (await requireTenantPermission('documents.manage')) as unknown as DocumentContext & Parameters<typeof allowedKeys>[0]
  const { folder } = await searchParams
  const settings = await loadDocumentSettings(context.activeOrganization.id)
  const options = await loadDocumentFormOptions(context, { locationId: null, interval: settings.default_review_interval_months })
  const category = options.folders.find(name => name.toLowerCase() === String(folder || '').toLowerCase()) || ''

  return (
    <div className='flex flex-col gap-6'>
      <DocumentPageHeader active='library' permissions={allowedKeys(context)} subtitle='Add a controlled document, then upload its first version.' />
      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle>New document</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentForm
            initial={{
              documentNumber: '',
              name: '',
              description: '',
              category,
              locationId: options.allowCompanyWide ? '' : options.locations[0]?.id || '',
              ownerUserId: context.user.id,
              reviewIntervalMonths: String(settings.default_review_interval_months),
              reviewDueOn: '',
              requiresAcknowledgment: true
            }}
            folders={options.folders}
            locations={options.locations}
            members={options.members}
            intervals={options.intervals}
            allowCompanyWide={options.allowCompanyWide}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default NewDocumentPage
