import type { Metadata } from 'next'
import Link from 'next/link'
import { TbPlus } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import { DocumentPageHeader, DocumentStatusBadge } from '@/components/documents/DocumentPageHeader'
import FolderPanel from '@/components/documents/FolderPanel'
import { grantFor, loadDocumentSettings } from '@/lib/forgeDocumentAccess'
import { filterLibraryDocuments } from '@/lib/forgeDocumentLibrary'
import { allowedKeys, loadLibraryDocuments, loadLocations, requireDocumentsAccess , loadFolderInputs } from '@/lib/forgeDocumentLibraryServer'
import { DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS, REVIEW_STATE_LABELS, mergeDocumentFolders, reviewState } from '@/lib/forgeDocumentRules'

export const metadata: Metadata = { title: 'Document Control' }

type Search = { q?: string; status?: string; location?: string; folder?: string }

const selectClass = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'

const reviewTone = { overdue: 'text-destructive', due_soon: 'text-amber-600', ok: '', none: 'text-textSecondary' } as const

const DocumentsLibraryPage = async ({ searchParams }: { searchParams: Promise<Search> }) => {
  const context = await requireDocumentsAccess()
  const organizationId = context.activeOrganization.id
  const permissions = allowedKeys(context)
  const params = await searchParams
  const manageGrant = grantFor(context, 'documents.manage')

  const [docs, locations, settings, folderInputs] = await Promise.all([
    loadLibraryDocuments(context),
    loadLocations(organizationId),
    loadDocumentSettings(organizationId),
    loadFolderInputs(organizationId)
  ])

  const canSeeDrafts = docs.some(doc => doc.access.manage || doc.access.approve || doc.access.viewAcknowledgments)

  // Counts come from the documents this user can see; managers also see every stored folder.
  const counts = new Map<string, { category: string; count: number }>()

  for (const doc of docs) {
    if (!doc.category) continue
    const key = String(doc.category).toLowerCase()
    const entry = counts.get(key) || { category: doc.category, count: 0 }

    entry.count += 1
    counts.set(key, entry)
  }

  const folders = mergeDocumentFolders({ stored: manageGrant ? folderInputs.stored : [], categoryCounts: [...counts.values()] })
  const locationNames = new Map(locations.map(location => [location.id, location.name]))
  const rows = filterLibraryDocuments(docs, params)
  const filtered = Boolean(params.q || params.status || params.location || params.folder)
  const baseQuery = new URLSearchParams(Object.entries({ q: params.q, status: params.status, location: params.location }).filter(([, value]) => value) as [string, string][]).toString()

  return (
    <div className='flex flex-col gap-6'>
      <DocumentPageHeader
        active='library'
        permissions={permissions}
        subtitle='Policies, procedures and programs, with their approved versions and who they are for.'
        actions={
          manageGrant ? (
            <Button asChild>
              <Link href={'/documents/new' + (params.folder && params.folder !== 'none' ? '?folder=' + encodeURIComponent(params.folder) : '')}>
                <TbPlus />
                New document
              </Link>
            </Button>
          ) : null
        }
      />

      <div className='grid gap-6 lg:grid-cols-[260px_1fr]'>
        <FolderPanel
          folders={folders}
          active={params.folder || ''}
          total={docs.length}
          unfiled={docs.filter(doc => !doc.category).length}
          canCreate={Boolean(manageGrant)}
          canEdit={manageGrant?.scope === 'organization'}
          baseQuery={baseQuery}
        />

        <div className='flex min-w-0 flex-col gap-4'>
          <form className='flex flex-wrap items-center gap-3' action='/documents'>
            {params.folder ? <input type='hidden' name='folder' value={params.folder} /> : null}
            <input name='q' defaultValue={params.q || ''} placeholder='Search number, name or description' className='border-input bg-card h-[38px] w-72 rounded-md border px-3 text-sm' />
            {canSeeDrafts ? (
              <select name='status' defaultValue={params.status || ''} className={selectClass} aria-label='Status'>
                <option value=''>Any status</option>
                {DOCUMENT_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {DOCUMENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            ) : null}
            <select name='location' defaultValue={params.location || ''} className={selectClass} aria-label='Location'>
              <option value=''>Any location</option>
              <option value='company'>Company-wide</option>
              {locations.map(location => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            <Button type='submit' size='sm' variant='outline'>
              Apply
            </Button>
            {filtered ? (
              <Link className='text-primary text-sm hover:underline' href='/documents'>
                Clear
              </Link>
            ) : null}
          </form>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map(doc => {
                    const state = reviewState(doc.review_due_on, settings.review_warning_days)

                    return (
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
                        <TableCell>
                          {doc.review_due_on && doc.status === 'published' ? (
                            <span className={'text-sm ' + reviewTone[state]} title={REVIEW_STATE_LABELS[state]}>
                              {doc.review_due_on}
                              {state === 'overdue' || state === 'due_soon' ? <span className='block text-xs'>{REVIEW_STATE_LABELS[state]}</span> : null}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className='py-10 text-center'>
                      {filtered ? 'No documents match.' : 'No documents yet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default DocumentsLibraryPage
