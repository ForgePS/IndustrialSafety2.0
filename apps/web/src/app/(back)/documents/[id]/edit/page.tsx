import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DocumentForm from '@/components/documents/DocumentForm'
import { DocumentPageHeader } from '@/components/documents/DocumentPageHeader'
import { documentAccessFor, loadDocument, loadDocumentSettings, type DocumentContext } from '@/lib/forgeDocumentAccess'
import { allowedKeys, loadDocumentFormOptions } from '@/lib/forgeDocumentLibraryServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit Document' }

const EditDocumentPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = (await requireTenantPermission('documents.manage')) as unknown as DocumentContext & Parameters<typeof allowedKeys>[0]
  const { id } = await params
  const doc = await loadDocument(context.activeOrganization.id, id)
  const access = doc ? await documentAccessFor(context, doc) : null

  if (!doc || !access?.manage || doc.archived_at || doc.status === 'obsolete') notFound()

  const settings = await loadDocumentSettings(context.activeOrganization.id)
  const interval = doc.review_interval_months ?? settings.default_review_interval_months
  const options = await loadDocumentFormOptions(context, { locationId: doc.location_id, interval })

  return (
    <div className='flex flex-col gap-6'>
      <DocumentPageHeader active='library' permissions={allowedKeys(context)} subtitle={`${doc.document_number} · ${doc.name}`} />
      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle>Edit document</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentForm
            documentId={doc.id}
            initial={{
              documentNumber: doc.document_number,
              name: doc.name,
              description: doc.description || '',
              category: doc.category ? options.folders.find(name => name.toLowerCase() === doc.category.toLowerCase()) || doc.category : '',
              locationId: doc.location_id || '',
              ownerUserId: doc.owner_user_id || '',
              reviewIntervalMonths: String(interval),
              reviewDueOn: doc.review_due_on || '',
              requiresAcknowledgment: doc.requires_acknowledgment !== false
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

export default EditDocumentPage
