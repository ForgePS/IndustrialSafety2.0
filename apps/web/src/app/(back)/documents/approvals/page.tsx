import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import { DocumentPageHeader } from '@/components/documents/DocumentPageHeader'
import VersionWorkflowButtons from '@/components/documents/VersionWorkflowButtons'
import { documentWithinScope, grantFor, loadDocumentSettings, DOCUMENT_COLUMNS, VERSION_COLUMNS, type DocumentContext } from '@/lib/forgeDocumentAccess'
import { canDecideVersion, formatBytes } from '@/lib/forgeDocumentRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Document Approvals' }
export const dynamic = 'force-dynamic'

/**
 * Port slice 12: versions waiting for approval, for documents in the approver's scope. Approve or send back
 * from here; a version you submitted yourself is listed but needs someone else (unless self-approval is on).
 */
const ApprovalsPage = async () => {
  const context = (await requireTenantPermission('documents.approve')) as unknown as DocumentContext
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const permissions = context.access.effective.filter(item => item.allowed).map(item => item.permissionKey)
  const supabase = createServiceRoleClient() as any

  const [{ data: versions }, settings] = await Promise.all([
    supabase.from('forge_document_versions').select(VERSION_COLUMNS).eq('organization_id', organizationId).eq('status', 'in_review').order('submitted_at', { ascending: true }),
    loadDocumentSettings(organizationId)
  ])

  const list = (versions || []) as any[]
  const docIds = [...new Set(list.map(version => version.document_id as string))]

  const { data: docRows } = docIds.length
    ? await supabase.from('forge_documents').select(DOCUMENT_COLUMNS).eq('organization_id', organizationId).is('archived_at', null).in('id', docIds)
    : { data: [] }

  const approveGrant = grantFor(context, 'documents.approve')
  const manageGrant = grantFor(context, 'documents.manage')
  const docs = new Map<string, any>()

  for (const doc of (docRows || []) as any[]) {
    if (await documentWithinScope({ organizationId, userId, scope: approveGrant?.scope ?? null, doc })) docs.set(doc.id, doc)
  }

  const items = list.filter(version => docs.has(version.document_id))
  const submitterIds = [...new Set(items.map(version => version.submitted_by).filter(Boolean))]

  const { data: users } = submitterIds.length ? await supabase.from('users').select('user_id, name, email').in('user_id', submitterIds) : { data: [] }
  const names = new Map<string, string>(((users || []) as any[]).map(row => [row.user_id, row.name || row.email || 'Unknown user']))

  const rows = await Promise.all(
    items.map(async version => {
      const doc = docs.get(version.document_id)
      const canManage = manageGrant ? await documentWithinScope({ organizationId, userId, scope: manageGrant.scope, doc }) : false

      return { version, doc, canManage, canDecide: canDecideVersion(doc, version, userId, settings.allow_self_approval) }
    })
  )

  return (
    <div className='flex flex-col gap-6'>
      <DocumentPageHeader active='approvals' permissions={permissions} subtitle='Document versions waiting for approval. Approving publishes the version and sets the next review date.' />

      <Card>
        <CardHeader>
          <CardTitle>
            Waiting for approval <span className='text-textSecondary text-base font-normal'>({rows.length})</span>
          </CardTitle>
        </CardHeader>
        {rows.length ? (
          <Table data-testid='approvals-table'>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Change summary</TableHead>
                <TableHead className='w-[340px]'>Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ version, doc, canManage, canDecide }) => (
                <TableRow key={version.id} data-approval={doc.document_number}>
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
                    Version {version.version_number}
                    <div className='text-textSecondary text-xs'>
                      <Link className='hover:underline' href={`/documents/${doc.id}/versions/${version.id}/file`} prefetch={false}>
                        {version.file_name}
                      </Link>{' '}
                      · {formatBytes(Number(version.size_bytes))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {version.submitted_at ? String(version.submitted_at).slice(0, 10) : '—'}
                    <div className='text-textSecondary text-xs'>{version.submitted_by ? names.get(version.submitted_by) || 'Unknown user' : ''}</div>
                  </TableCell>
                  <TableCell className='max-w-[280px] whitespace-pre-wrap text-sm'>{version.change_summary || '—'}</TableCell>
                  <TableCell>
                    <VersionWorkflowButtons
                      documentId={doc.id}
                      version={{ id: version.id, status: version.status, submitted_by: version.submitted_by, version_number: version.version_number }}
                      canManage={canManage}
                      canApprove
                      canSubmit={false}
                      canDecide={canDecide}
                      currentUserId={userId}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent>
            <p className='text-textSecondary text-sm' data-testid='approvals-empty'>
              Nothing is waiting for approval.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

export default ApprovalsPage
