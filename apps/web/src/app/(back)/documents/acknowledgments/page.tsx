import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import AcknowledgeButton from '@/components/documents/AcknowledgeButton'
import { DocumentPageHeader } from '@/components/documents/DocumentPageHeader'
import { pendingAcknowledgments } from '@/lib/forgeDocumentAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Documents To Read' }
export const dynamic = 'force-dynamic'

/**
 * Port slice 12: "To read". The current published version of every document distributed to you that you have
 * not acknowledged yet (only the current version: a superseded one drops off), and what you acknowledged before.
 */
const AcknowledgmentsPage = async () => {
  const context = await requireTenantPermission('documents.view')
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const permissions = context.access.effective.filter(item => item.allowed).map(item => item.permissionKey)
  const supabase = createServiceRoleClient() as any

  const [pending, { data: history }] = await Promise.all([
    pendingAcknowledgments(organizationId, userId),
    supabase
      .from('forge_document_acknowledgments')
      .select('id, acknowledged_at, version_id, forge_documents(id, document_number, name, status, archived_at, current_version_id), forge_document_versions(version_number)')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('acknowledged_at', { ascending: false })
      .limit(200)
  ])

  const versionIds = pending.map(doc => doc.current_version_id as string)

  const { data: versions } = versionIds.length
    ? await supabase.from('forge_document_versions').select('id, version_number, file_name, effective_on, change_summary').eq('organization_id', organizationId).in('id', versionIds)
    : { data: [] }

  const versionById = new Map<string, any>(((versions || []) as any[]).map(row => [row.id, row]))
  const done = ((history || []) as any[]).filter(row => row.forge_documents && !row.forge_documents.archived_at)

  return (
    <div className='flex flex-col gap-6'>
      <DocumentPageHeader active='acknowledgments' permissions={permissions} subtitle='Documents you need to read and acknowledge.' />

      <Card data-testid='to-read'>
        <CardHeader>
          <CardTitle>
            To read <span className='text-textSecondary text-base font-normal'>({pending.length})</span>
          </CardTitle>
        </CardHeader>
        {pending.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead className='w-[260px]'></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map(doc => {
                const version = versionById.get(doc.current_version_id)

                return (
                  <TableRow key={doc.id} data-to-read={doc.document_number}>
                    <TableCell>
                      <Link className='text-primary font-semibold hover:underline' href={'/documents/' + doc.id}>
                        {doc.name}
                      </Link>
                      <div className='text-textSecondary text-xs'>
                        {doc.document_number}
                        {doc.category ? ' · ' + doc.category : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      {version ? `Version ${version.version_number}` : '—'}
                      {version?.change_summary ? <div className='text-textSecondary max-w-[320px] truncate text-xs'>{version.change_summary}</div> : null}
                    </TableCell>
                    <TableCell>{version?.effective_on || '—'}</TableCell>
                    <TableCell>
                      <div className='flex flex-wrap items-center gap-2'>
                        <a
                          className='border-input hover:bg-secondary inline-flex h-8 items-center rounded-md border px-3 text-sm'
                          href={`/documents/${doc.id}/versions/${doc.current_version_id}/file`}
                          target='_blank'
                          rel='noreferrer'
                          data-testid='open-document'
                        >
                          Open
                        </a>
                        <AcknowledgeButton documentId={doc.id} versionId={doc.current_version_id} acknowledged={false} />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <CardContent>
            <p className='text-textSecondary text-sm' data-testid='to-read-empty'>
              You are up to date. Nothing to read.
            </p>
          </CardContent>
        )}
      </Card>

      <Card data-testid='acknowledged-history'>
        <CardHeader>
          <CardTitle>Acknowledged</CardTitle>
        </CardHeader>
        {done.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Acknowledged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {done.map(row => {
                const current = row.forge_documents.status === 'published' && row.forge_documents.current_version_id === row.version_id

                return (
                  <TableRow key={row.id} data-acknowledged={row.forge_documents.document_number} data-current={current ? 'yes' : 'no'}>
                    <TableCell>
                      <Link className='text-primary font-semibold hover:underline' href={'/documents/' + row.forge_documents.id}>
                        {row.forge_documents.name}
                      </Link>
                      <div className='text-textSecondary text-xs'>{row.forge_documents.document_number}</div>
                    </TableCell>
                    <TableCell>
                      Version {row.forge_document_versions?.version_number ?? '—'}
                      {current ? null : <div className='text-textSecondary text-xs'>No longer current</div>}
                    </TableCell>
                    <TableCell>{String(row.acknowledged_at).slice(0, 10)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <CardContent>
            <p className='text-textSecondary text-sm'>Nothing acknowledged yet.</p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

export default AcknowledgmentsPage
