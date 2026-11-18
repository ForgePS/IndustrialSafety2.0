import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TbDownload, TbExternalLink, TbFileSpreadsheet } from 'react-icons/tb'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import AcknowledgeButton from '@/components/documents/AcknowledgeButton'
import DistributionEditor from '@/components/documents/DistributionEditor'
import DocumentActionsPanel from '@/components/documents/DocumentActionsPanel'
import { DocumentPageHeader, DocumentStatusBadge, VersionStatusBadge } from '@/components/documents/DocumentPageHeader'
import VersionUploadForm, { DeleteDraftVersionButton } from '@/components/documents/VersionUploadForm'
import VersionWorkflowButtons from '@/components/documents/VersionWorkflowButtons'
import {
  documentAccessFor,
  documentAudience,
  documentReachesUser,
  loadDistributions,
  loadDocument,
  loadDocumentSettings,
  loadVersions
} from '@/lib/forgeDocumentAccess'
import { canDownloadVersion, nextVersionNumber } from '@/lib/forgeDocumentLibrary'
import { allowedKeys, loadDistributionOptions, loadLocations, requireDocumentsAccess, userNames } from '@/lib/forgeDocumentLibraryServer'
import {
  REVIEW_STATE_LABELS,
  acknowledgmentSummary,
  canConfirmReview,
  canDecideVersion,
  canObsolete,
  canSubmitVersion,
  canUploadVersion,
  formatBytes,
  reviewState
} from '@/lib/forgeDocumentRules'

export const metadata: Metadata = { title: 'Document' }

const db = () => createServiceRoleClient() as any

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className='text-textSecondary text-xs font-medium uppercase'>{label}</dt>
    <dd className='mt-1 text-sm'>{children}</dd>
  </div>
)

const DocumentPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireDocumentsAccess()
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const { id } = await params
  const doc = await loadDocument(organizationId, id)
  const access = doc ? await documentAccessFor(context, doc) : null

  if (!doc || !access) notFound()

  const staff = access.manage || access.approve || access.viewAcknowledgments

  const [allVersions, settings, locations, distributions, reaches] = await Promise.all([
    loadVersions(organizationId, doc.id),
    loadDocumentSettings(organizationId),
    loadLocations(organizationId),
    loadDistributions(organizationId, doc.id),
    documentReachesUser(doc.id, userId)
  ])

  const current = allVersions.find(version => version.id === doc.current_version_id) || null

  // View-only users only see the current version.
  const versions = staff ? allVersions : current ? [current] : []
  const archived = Boolean(doc.archived_at)
  const published = doc.status === 'published' && !archived
  const showAcknowledgments = published && doc.requires_acknowledgment && current && (access.viewAcknowledgments || access.manage)

  const [distributionOptions, audience, acks, activity, myAck] = await Promise.all([
    staff ? loadDistributionOptions(organizationId) : Promise.resolve(null),
    showAcknowledgments ? documentAudience(organizationId, doc.id) : Promise.resolve([]),
    showAcknowledgments
      ? db().from('forge_document_acknowledgments').select('user_id, acknowledged_at').eq('organization_id', organizationId).eq('version_id', current.id).then((result: any) => result.data || [])
      : Promise.resolve([]),
    staff
      ? db()
          .from('forge_document_activity')
          .select('id, version_id, actor_user_id, activity_type, message, created_at')
          .eq('organization_id', organizationId)
          .eq('document_id', doc.id)
          .order('created_at', { ascending: false })
          .limit(100)
          .then((result: any) => result.data || [])
      : Promise.resolve([]),
    published && current && doc.requires_acknowledgment && reaches
      ? db()
          .from('forge_document_acknowledgments')
          .select('acknowledged_at')
          .eq('organization_id', organizationId)
          .eq('version_id', current.id)
          .eq('user_id', userId)
          .maybeSingle()
          .then((result: any) => result.data)
      : Promise.resolve(null)
  ])

  const names = new Map(
    (await userNames([doc.owner_user_id, ...allVersions.flatMap(version => [version.created_by, version.submitted_by, version.approved_by, version.rejected_by]), ...activity.map((row: any) => row.actor_user_id)])).map(
      row => [row.id, row.name]
    )
  )

  const nameOf = (id: string | null | undefined) => (id ? names.get(id) || 'Unknown user' : '—')
  const state = reviewState(doc.review_due_on, settings.review_warning_days)

  const summary = acknowledgmentSummary(
    audience.map(person => person.userId),
    (acks as any[]).map(row => row.user_id)
  )

  const acknowledgedIds = new Set((acks as any[]).map(row => row.user_id))
  const pendingPeople = audience.filter(person => !acknowledgedIds.has(person.userId))
  const fileHref = (versionId: string, download = false) => `/documents/${doc.id}/versions/${versionId}/file${download ? '?download=1' : ''}`

  return (
    <div className='flex flex-col gap-6'>
      <DocumentPageHeader active={archived ? 'archived' : 'library'} permissions={allowedKeys(context)} title={doc.name} subtitle={doc.document_number} />

      <div className='flex flex-wrap items-center gap-3'>
        <DocumentStatusBadge status={doc.status} />
        {archived ? <span className='rounded bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700'>Archived</span> : null}
        {published && (state === 'overdue' || state === 'due_soon') ? (
          <span className={'text-sm font-medium ' + (state === 'overdue' ? 'text-destructive' : 'text-amber-600')}>{REVIEW_STATE_LABELS[state]}</span>
        ) : null}
        <div className='ml-auto'>
          <DocumentActionsPanel
            documentId={doc.id}
            archived={archived}
            canEdit={access.manage && doc.status !== 'obsolete'}
            canArchive={access.manage}
            canObsolete={access.approve && canObsolete(doc)}
            canConfirmReview={access.manage && canConfirmReview(doc)}
          />
        </div>
      </div>

      {doc.status === 'obsolete' ? (
        <Card className='border-destructive/40'>
          <CardContent className='pt-6 text-sm'>
            This document is obsolete{doc.obsolete_reason ? `: ${doc.obsolete_reason}` : '.'} Nobody is asked to read it.
          </CardContent>
        </Card>
      ) : null}

      <div className='grid gap-6 lg:grid-cols-[1fr_360px]'>
        <div className='flex min-w-0 flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Current version</CardTitle>
              <CardDescription>
                {current ? `Version ${current.version_number}, effective ${current.effective_on || '—'}` : 'No version has been approved yet.'}
              </CardDescription>
            </CardHeader>
            {current ? (
              <CardContent className='flex flex-wrap items-center gap-3'>
                <div className='min-w-0 flex-1 text-sm'>
                  <div className='truncate font-medium'>{current.file_name}</div>
                  <div className='text-textSecondary text-xs'>{formatBytes(Number(current.size_bytes))}</div>
                </div>
                <Button size='sm' variant='outline' asChild>
                  <a href={fileHref(current.id)} target='_blank' rel='noreferrer'>
                    <TbExternalLink />
                    Open
                  </a>
                </Button>
                <Button size='sm' variant='outline' asChild>
                  <a href={fileHref(current.id, true)} data-testid='download-current'>
                    <TbDownload />
                    Download
                  </a>
                </Button>
                {published && doc.requires_acknowledgment && reaches && current ? (
                  <AcknowledgeButton documentId={doc.id} versionId={current.id} acknowledged={Boolean(myAck)} />
                ) : null}
              </CardContent>
            ) : null}
          </Card>

          {staff ? (
            <Card data-testid='document-versions'>
              <CardHeader>
                <CardTitle>Versions</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-4'>
                {versions.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>History</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map(version => (
                        <TableRow key={version.id} data-version={version.version_number}>
                          <TableCell className='font-semibold'>{version.version_number}</TableCell>
                          <TableCell>
                            {canDownloadVersion(access, doc, version) ? (
                              <a className='text-primary hover:underline' href={fileHref(version.id)} target='_blank' rel='noreferrer'>
                                {version.file_name}
                              </a>
                            ) : (
                              version.file_name
                            )}
                            <div className='text-textSecondary text-xs'>{formatBytes(Number(version.size_bytes))}</div>
                            {version.change_summary ? <div className='text-textSecondary text-xs'>{version.change_summary}</div> : null}
                          </TableCell>
                          <TableCell>
                            <VersionStatusBadge status={version.status} />
                          </TableCell>
                          <TableCell className='text-xs'>
                            <div>Uploaded by {nameOf(version.created_by)}</div>
                            {version.submitted_at ? <div>Submitted by {nameOf(version.submitted_by)}</div> : null}
                            {version.approved_at ? (
                              <div>
                                Approved by {nameOf(version.approved_by)}, effective {version.effective_on}
                              </div>
                            ) : null}
                            {version.status === 'draft' && version.rejection_reason ? (
                              <div className='text-destructive'>
                                Sent back by {nameOf(version.rejected_by)}: {version.rejection_reason}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className='flex flex-col items-end gap-2'>
                              <VersionWorkflowButtons
                                documentId={doc.id}
                                version={{ id: version.id, status: version.status, submitted_by: version.submitted_by, version_number: version.version_number }}
                                canManage={access.manage}
                                canApprove={access.approve}
                                canSubmit={access.manage && canSubmitVersion(doc, version, allVersions)}
                                canDecide={access.approve && canDecideVersion(doc, version, userId, settings.allow_self_approval)}
                                currentUserId={userId}
                              />
                              {access.manage && version.status === 'draft' ? (
                                <DeleteDraftVersionButton documentId={doc.id} versionId={version.id} versionNumber={version.version_number} />
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className='text-textSecondary text-sm'>No versions yet.</p>
                )}
                {access.manage && canUploadVersion(doc) ? <VersionUploadForm documentId={doc.id} nextVersion={nextVersionNumber(allVersions)} /> : null}
              </CardContent>
            </Card>
          ) : null}

          {staff ? (
            <Card data-testid='document-activity'>
              <CardHeader>
                <CardTitle>History</CardTitle>
              </CardHeader>
              <CardContent>
                {activity.length ? (
                  <ul className='divide-y text-sm'>
                    {activity.map((row: any) => (
                      <li key={row.id} className='py-2' data-activity={row.activity_type}>
                        <div>{row.message}</div>
                        <div className='text-textSecondary text-xs'>
                          {nameOf(row.actor_user_id)} · {formatDateTime(row.created_at)}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className='text-textSecondary text-sm'>Nothing yet.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className='grid gap-4'>
                {doc.description ? <Detail label='Description'>{doc.description}</Detail> : null}
                <Detail label='Folder'>{doc.category ? <Link className='text-primary hover:underline' href={'/documents?folder=' + encodeURIComponent(doc.category)}>{doc.category}</Link> : 'Not in a folder'}</Detail>
                <Detail label='Location'>{doc.location_id ? locations.find(location => location.id === doc.location_id)?.name || '—' : 'Company-wide'}</Detail>
                <Detail label='Owner'>{nameOf(doc.owner_user_id)}</Detail>
                <Detail label='Review every'>{doc.review_interval_months ? `${doc.review_interval_months} months` : `${settings.default_review_interval_months} months (company default)`}</Detail>
                <Detail label='Next review'>{doc.review_due_on || '—'}</Detail>
                {doc.last_reviewed_on ? <Detail label='Last reviewed'>{doc.last_reviewed_on}</Detail> : null}
                <Detail label='Acknowledgment'>{doc.requires_acknowledgment ? 'Required' : 'Not required'}</Detail>
              </dl>
            </CardContent>
          </Card>

          {staff ? (
            <Card>
              <CardHeader>
                <CardTitle>Who it is for</CardTitle>
              </CardHeader>
              <CardContent>
                <DistributionEditor
                  documentId={doc.id}
                  initial={distributions}
                  options={distributionOptions || { location: [], department: [], role: [] }}
                  canEdit={access.manage && !archived}
                />
              </CardContent>
            </Card>
          ) : null}

          {showAcknowledgments ? (
            <Card data-testid='acknowledgment-progress'>
              <CardHeader>
                <CardTitle>Acknowledgments</CardTitle>
                <CardDescription>Version {current.version_number}</CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3 text-sm'>
                <div>
                  <div className='flex justify-between'>
                    <span>
                      {summary.acknowledged} of {summary.audience} acknowledged
                    </span>
                    <span className='font-semibold'>{summary.percent}%</span>
                  </div>
                  <div className='bg-secondary mt-1 h-2 overflow-hidden rounded'>
                    <div className='bg-primary h-full' style={{ width: `${summary.percent}%` }} />
                  </div>
                </div>
                {pendingPeople.length ? (
                  <div>
                    <div className='text-textSecondary text-xs font-medium uppercase'>Still to read</div>
                    <ul className='mt-1'>
                      {pendingPeople.slice(0, 15).map(person => (
                        <li key={person.userId}>{person.name}</li>
                      ))}
                    </ul>
                    {pendingPeople.length > 15 ? <div className='text-textSecondary text-xs'>and {pendingPeople.length - 15} more</div> : null}
                  </div>
                ) : null}
                {access.viewAcknowledgments ? (
                  <Button size='sm' variant='outline' asChild>
                    <a href={`/documents/${doc.id}/acknowledgments.csv`}>
                      <TbFileSpreadsheet />
                      Export CSV
                    </a>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default DocumentPage
