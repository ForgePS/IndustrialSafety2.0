import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { archiveCompany, archiveDocument } from '@/app/(back)/contractors/actions'
import DocumentForm from '@/components/contractors/DocumentForm'
import StandingBadge, { ProblemList } from '@/components/contractors/StandingBadge'
import StatusPanel from '@/components/contractors/StatusPanel'
import ActionButton from '@/components/emergency/ActionButton'
import { companyStatusLabel, documentTypeLabel, expiryState } from '@/lib/forgeContractorRules'
import { companyLocations, contractorRights, loadCompany, todayIso, workerName } from '@/lib/forgeContractors'
import { userNames } from '@/lib/forgeDocumentLibraryServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Contractor company' }

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className='text-textSecondary text-xs font-medium uppercase'>{label}</dt>
    <dd className='text-sm'>{children || '—'}</dd>
  </div>
)

const money = (value: unknown) => (value === null || value === undefined ? null : '$' + Number(value).toLocaleString('en-US'))

/** Port slice 15: one contractor company with its standing, documents and workers. */
const ContractorPage = async ({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) => {
  const { id } = await params
  const query = await searchParams
  const context = await requireTenantPermission('contractor_safety.view')
  const organizationId = context.activeOrganization.id
  const rights = await contractorRights(organizationId, context.user.id, context.access)
  const found = await loadCompany({ organizationId, rights, id })

  if (!found) notFound()

  const { company, standing, canManage, settings } = found
  const today = todayIso()
  const showHistory = query.history === '1'
  const documents = found.documents.filter((document: any) => showHistory || !document.archived_at)
  const [locations, sponsor] = await Promise.all([companyLocations(organizationId), userNames([company.sponsor_user_id])])
  const names = new Map(locations.map(location => [location.id, location.name]))
  const editable = canManage && !company.archived_at

  return (
    <div className='flex flex-col gap-6' data-contractor-company-page>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href='/contractors' className='text-primary text-sm hover:underline'>
            ← Contractor Safety
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{company.name}</h1>
          <div className='mt-2 flex flex-wrap items-center gap-3 text-sm'>
            <span data-company-status>{companyStatusLabel(company.status)}</span>
            <StandingBadge standing={standing} />
            {company.archived_at ? <span className='text-textSecondary'>Archived</span> : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {editable ? (
            <Button asChild variant='outline'>
              <Link href={`/contractors/${company.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {canManage ? (
            <ActionButton
              run={archiveCompany.bind(null, company.id, !company.archived_at)}
              label={company.archived_at ? 'Restore' : 'Archive'}
              confirm={company.archived_at ? undefined : 'Archive this company? Its workers will no longer be able to sign in.'}
            />
          ) : null}
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <dl className='grid gap-4 md:grid-cols-3'>
              <Detail label='Trade'>{company.trade}</Detail>
              <Detail label='Contact'>{[company.contact_name, company.contact_email, company.contact_phone].filter(Boolean).join(' · ')}</Detail>
              <Detail label='Sponsor'>{company.sponsor_user_id ? sponsor[0]?.name : null}</Detail>
              <Detail label='Sites'>{company.location_ids.length ? company.location_ids.map((item: string) => names.get(item) || 'Unknown').join(', ') : 'Any site'}</Detail>
              <Detail label='EMR'>{company.emr}</Detail>
              <Detail label='TRIR'>{company.trir}</Detail>
            </dl>
            {company.status_reason ? <p className='text-sm'>Status note: {company.status_reason}</p> : null}
            {company.notes ? <p className='text-sm whitespace-pre-wrap'>{company.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cleared to work</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {standing.cleared && !standing.warnings.length ? <p className='text-success text-sm'>Approved with every required document current.</p> : <ProblemList standing={standing} />}
            <p className='text-textSecondary text-xs'>
              Required: {settings.requiredDocuments.length ? settings.requiredDocuments.map(documentTypeLabel).join(', ') : 'no documents'}.
            </p>
            {rights.approve && !company.archived_at ? <StatusPanel companyId={company.id} status={company.status} /> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <CardTitle>Documents</CardTitle>
          <Link href={`/contractors/${company.id}${showHistory ? '' : '?history=1'}`} className='text-primary text-sm hover:underline'>
            {showHistory ? 'Hide removed' : 'Show removed'}
          </Link>
        </CardHeader>
        <CardContent className='flex flex-col gap-6'>
          {documents.length ? (
            <table className='w-full border-collapse text-sm' data-contractor-documents>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4 font-semibold'>Document</th>
                  <th className='py-2 pr-4 font-semibold'>Coverage</th>
                  <th className='py-2 pr-4 font-semibold'>Expires</th>
                  <th className='py-2 pr-4 font-semibold'>File</th>
                  <th className='py-2 font-semibold' />
                </tr>
              </thead>
              <tbody>
                {documents.map((document: any) => {
                  const state = document.expires_on ? expiryState(document.expires_on, today, settings.warningDays) : null

                  return (
                    <tr key={document.id} className={'border-b last:border-0 ' + (document.archived_at ? 'text-textSecondary' : '')} data-contractor-document={document.doc_type}>
                      <td className='py-2 pr-4'>
                        {documentTypeLabel(document.doc_type)}
                        {document.title ? <span className='text-textSecondary'> · {document.title}</span> : null}
                        {document.archived_at ? <span className='text-textSecondary'> (removed)</span> : null}
                      </td>
                      <td className='py-2 pr-4'>{money(document.coverage_amount) || '—'}</td>
                      <td className='py-2 pr-4'>
                        {document.expires_on ? (
                          <span className={state === 'expired' ? 'text-error font-semibold' : state === 'expiring' ? 'text-warning font-semibold' : ''}>
                            {document.expires_on}
                            {state === 'expired' ? ' (expired)' : state === 'expiring' ? ' (expiring)' : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className='py-2 pr-4'>
                        {document.storage_path ? (
                          <a href={`/contractors/${company.id}/documents/${document.id}`} target='_blank' rel='noreferrer' className='text-primary hover:underline'>
                            {document.file_name}
                          </a>
                        ) : (
                          'No file'
                        )}
                      </td>
                      <td className='py-2 text-right'>
                        {editable && !document.archived_at ? <ActionButton run={archiveDocument.bind(null, company.id, document.id)} label='Remove' confirm='Remove this document? It stays in the history.' /> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary text-sm'>No documents on file.</p>
          )}
          {editable ? <DocumentForm companyId={company.id} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <CardTitle>Workers</CardTitle>
          {editable ? (
            <Button asChild size='sm'>
              <Link href={`/contractors/workers/new?company=${company.id}`}>Add worker</Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {found.workers.length ? (
            <table className='w-full border-collapse text-sm' data-contractor-workers>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4 font-semibold'>Name</th>
                  <th className='py-2 pr-4 font-semibold'>Badge</th>
                  <th className='py-2 pr-4 font-semibold'>Orientation</th>
                  <th className='py-2 font-semibold'>Cleared to work</th>
                </tr>
              </thead>
              <tbody>
                {found.workers.map((worker: any) => (
                  <tr key={worker.id} className='border-b last:border-0' data-contractor-worker={workerName(worker)}>
                    <td className='py-2 pr-4'>
                      <Link href={'/contractors/workers/' + worker.id} className='text-primary font-medium hover:underline'>
                        {workerName(worker)}
                      </Link>
                      {worker.active ? null : <span className='text-textSecondary'> (inactive)</span>}
                    </td>
                    <td className='py-2 pr-4'>{worker.badge_number || '—'}</td>
                    <td className='py-2 pr-4'>{worker.orientation_completed_on || 'Not done'}</td>
                    <td className='py-2'>
                      <StandingBadge standing={worker.standing} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary text-sm'>No workers yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ContractorPage
