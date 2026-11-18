import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import { DocumentPageHeader } from '@/components/documents/DocumentPageHeader'
import ReviewConfirmButton from '@/components/documents/ReviewConfirmButton'
import { documentScopeFilter, grantFor, loadDocumentSettings, DOCUMENT_COLUMNS, type DocumentContext } from '@/lib/forgeDocumentAccess'
import { daysUntil, reviewState, todayIso } from '@/lib/forgeDocumentRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Document Reviews' }
export const dynamic = 'force-dynamic'

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/**
 * Port slice 12: published documents whose periodic review is overdue or due within the review_warning_days
 * setting, for the documents in the manager's scope. Confirm a review with no changes here, or open the
 * document to upload a new version.
 */
const ReviewsPage = async () => {
  const context = (await requireTenantPermission('documents.manage')) as unknown as DocumentContext
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const permissions = context.access.effective.filter(item => item.allowed).map(item => item.permissionKey)
  const settings = await loadDocumentSettings(organizationId)
  const warningDays = settings.review_warning_days
  const scope = await documentScopeFilter({ organizationId, userId, scope: grantFor(context, 'documents.manage')?.scope ?? null })

  let query = (createServiceRoleClient() as any)
    .from('forge_documents')
    .select(DOCUMENT_COLUMNS + ', locations(name)')
    .eq('organization_id', organizationId)
    .eq('status', 'published')
    .is('archived_at', null)
    .not('review_due_on', 'is', null)
    .lte('review_due_on', addDays(todayIso(), warningDays))
    .order('review_due_on', { ascending: true })

  if (scope) query = query.or(scope)

  const { data } = await query
  const docs = (data || []) as any[]
  const ownerIds = [...new Set(docs.map(doc => doc.owner_user_id).filter(Boolean))]

  const { data: users } = ownerIds.length ? await (createServiceRoleClient() as any).from('users').select('user_id, name, email').in('user_id', ownerIds) : { data: [] }
  const names = new Map<string, string>(((users || []) as any[]).map(row => [row.user_id, row.name || row.email || 'Unknown user']))

  const groups = [
    { key: 'overdue', title: 'Review overdue', items: docs.filter(doc => reviewState(doc.review_due_on, warningDays) === 'overdue') },
    { key: 'due_soon', title: `Review due within ${warningDays} days`, items: docs.filter(doc => reviewState(doc.review_due_on, warningDays) === 'due_soon') }
  ]

  return (
    <div className='flex flex-col gap-6'>
      <DocumentPageHeader
        active='reviews'
        permissions={permissions}
        subtitle={`Published documents due for their periodic review. Owners and managers are reminded ${warningDays} days ahead.`}
      />

      {groups.map(group => (
        <Card key={group.key} data-review-group={group.key}>
          <CardHeader>
            <CardTitle>
              {group.title} <span className='text-textSecondary text-base font-normal'>({group.items.length})</span>
            </CardTitle>
          </CardHeader>
          {group.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Review due</TableHead>
                  <TableHead>Last reviewed</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className='w-[260px]'></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map(doc => {
                  const days = daysUntil(doc.review_due_on) ?? 0

                  return (
                    <TableRow key={doc.id} data-review={doc.document_number}>
                      <TableCell>
                        <Link className='text-primary font-semibold hover:underline' href={'/documents/' + doc.id}>
                          {doc.name}
                        </Link>
                        <div className='text-textSecondary text-xs'>
                          {doc.document_number}
                          {doc.category ? ' · ' + doc.category : ''}
                        </div>
                      </TableCell>
                      <TableCell data-review-due={doc.review_due_on}>
                        {doc.review_due_on}
                        <div className='text-textSecondary text-xs'>{days < 0 ? `${-days} days overdue` : days === 0 ? 'Today' : `In ${days} days`}</div>
                      </TableCell>
                      <TableCell>{doc.last_reviewed_on || '—'}</TableCell>
                      <TableCell>{doc.owner_user_id ? names.get(doc.owner_user_id) || 'Unknown user' : '—'}</TableCell>
                      <TableCell>{doc.locations?.name || 'Company-wide'}</TableCell>
                      <TableCell>
                        <ReviewConfirmButton documentId={doc.id} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <CardContent>
              <p className='text-textSecondary text-sm'>Nothing here.</p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}

export default ReviewsPage
