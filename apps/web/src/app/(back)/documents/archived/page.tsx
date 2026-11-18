import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import ArchivedRestoreButton from '@/components/documents/ArchivedRestoreButton'
import { DocumentPageHeader, DocumentStatusBadge } from '@/components/documents/DocumentPageHeader'
import type { DocumentContext } from '@/lib/forgeDocumentAccess'
import { allowedKeys, loadLibraryDocuments, loadLocations, userNames } from '@/lib/forgeDocumentLibraryServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Archived Documents' }

const ArchivedDocumentsPage = async () => {
  const context = (await requireTenantPermission('documents.manage')) as unknown as DocumentContext & Parameters<typeof allowedKeys>[0]
  const organizationId = context.activeOrganization.id
  const [docs, locations] = await Promise.all([loadLibraryDocuments(context, { archived: true }), loadLocations(organizationId)])
  const rows = docs.filter(doc => doc.access.manage)
  const names = new Map((await userNames(rows.map(doc => doc.archived_by))).map(row => [row.id, row.name]))
  const locationNames = new Map(locations.map(location => [location.id, location.name]))

  return (
    <div className='flex flex-col gap-6'>
      <DocumentPageHeader active='archived' permissions={allowedKeys(context)} subtitle='Archived documents are hidden from the library and nobody is asked to read them. Their files are kept.' />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Folder</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Archived</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map(doc => (
                <TableRow key={doc.id} data-document={doc.document_number}>
                  <TableCell>
                    <Link className='text-primary font-semibold hover:underline' href={'/documents/' + doc.id}>
                      {doc.name}
                    </Link>
                    <div className='text-textSecondary text-xs'>{doc.document_number}</div>
                  </TableCell>
                  <TableCell>{doc.category || '—'}</TableCell>
                  <TableCell>{doc.location_id ? locationNames.get(doc.location_id) || '—' : 'Company-wide'}</TableCell>
                  <TableCell>
                    <DocumentStatusBadge status={doc.status} />
                  </TableCell>
                  <TableCell className='text-xs'>
                    {String(doc.archived_at).slice(0, 10)}
                    {doc.archived_by ? <div className='text-textSecondary'>by {names.get(doc.archived_by) || 'Unknown user'}</div> : null}
                  </TableCell>
                  <TableCell className='text-right'>
                    <ArchivedRestoreButton documentId={doc.id} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className='py-10 text-center'>
                  No archived documents.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default ArchivedDocumentsPage
