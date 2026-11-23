import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { cancelMoc, closeMoc, implementMoc, removeAction, submitMoc, unlinkDocument } from '@/app/(back)/process-safety/actions'
import ActionButton from '@/components/emergency/ActionButton'
import ActionForm from '@/components/process-safety/ActionForm'
import ApproverForm from '@/components/process-safety/ApproverForm'
import DecisionForm from '@/components/process-safety/DecisionForm'
import DocumentLinkForm from '@/components/process-safety/DocumentLinkForm'
import PromptButton from '@/components/process-safety/PromptButton'
import PssrForm from '@/components/process-safety/PssrForm'
import { approverCandidates, companyAssets, companyLocations, companyPersonnel, linkableDocuments, loadMoc, psmRights, todayIso, userNameMap } from '@/lib/forgeProcessSafety'
import { actionDone, changeTypeLabel, impactLabel, mocStatusLabel, phaseLabel, PSSR_ITEMS, riskLabel, stepAllowed, temporaryOverdue } from '@/lib/forgeProcessSafetyRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Management of change' }

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className='text-textSecondary text-xs font-medium uppercase'>{label}</dt>
    <dd className='text-sm whitespace-pre-wrap'>{children || '—'}</dd>
  </div>
)

const capaStatus = (status: string | null | undefined) => (status ? status.replace(/_/g, ' ') : 'no Corrective Action')

const List = ({ items }: { items: string[] }) => (
  <ul className='text-warning list-disc pl-5 text-sm'>
    {items.map(item => (
      <li key={item}>{item}</li>
    ))}
  </ul>
)

/** Port slice 16: one management of change with its approvals, actions, documents, PSSR and history. */
const MocPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  // Named approvers hold approve but may not hold view; anyone else without view is sent away.
  const fallback = (await tenantPermissionOrNull('process_safety.view')) || (await tenantPermissionOrNull('process_safety.approve')) || (await requireTenantPermission('process_safety.view'))
  const organizationId = fallback.activeOrganization.id
  const rights = await psmRights(organizationId, fallback.user.id, fallback.access)
  const found = await loadMoc({ organizationId, rights, id })

  if (!found) notFound()

  const { moc, approvals, blockers, canManage, canApprove, canPssr } = found
  const today = todayIso()
  const open = moc.status !== 'closed' && moc.status !== 'canceled'
  const editable = canManage && stepAllowed('edit', moc.status)
  const excluded = [moc.owner_user_id, moc.created_by].filter(Boolean) as string[]

  const [locations, assets, personnel, documents, candidates, names] = await Promise.all([
    companyLocations(organizationId),
    moc.asset_id ? companyAssets(organizationId) : Promise.resolve([]),
    canManage && open ? companyPersonnel(organizationId) : Promise.resolve([]),
    canManage && open ? linkableDocuments(organizationId) : Promise.resolve([]),
    editable ? approverCandidates({ organizationId, locationId: moc.location_id, excluded }) : Promise.resolve([]),
    userNameMap([moc.owner_user_id, moc.created_by, moc.pssr_completed_by, ...approvals.map((item: any) => item.approver_user_id), ...found.activity.map((item: any) => item.actor_user_id)])
  ])

  const mine = approvals.find((item: any) => item.approver_user_id === fallback.user.id)
  const linked = new Set(found.documents.map((item: any) => item.document_id))

  return (
    <div className='flex flex-col gap-6' data-moc-page>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href='/process-safety' className='text-primary text-sm hover:underline'>
            ← Process Safety
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>
            {moc.moc_number}: {moc.title}
          </h1>
          <div className='mt-2 flex flex-wrap items-center gap-3 text-sm'>
            <span className='rounded-full border px-3 py-0.5 font-medium' data-moc-status>
              {mocStatusLabel(moc.status)}
            </span>
            <span>{riskLabel(moc.risk_level)} risk</span>
            {moc.is_temporary ? <span className={temporaryOverdue(moc, today) ? 'text-error font-semibold' : ''}>Temporary until {moc.temporary_until}</span> : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {editable ? (
            <Button asChild variant='outline'>
              <Link href={`/process-safety/changes/${moc.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {canManage && stepAllowed('submit', moc.status) ? <ActionButton run={submitMoc.bind(null, moc.id)} label={moc.status === 'rejected' ? 'Resubmit for review' : 'Submit for review'} variant='default' /> : null}
          {canManage && stepAllowed('implement', moc.status) ? (
            <ActionButton run={implementMoc.bind(null, moc.id)} label='Mark implemented' variant='default' confirm='Put this change into service?' data-implement />
          ) : null}
          {canManage && stepAllowed('close', moc.status) ? <ActionButton run={closeMoc.bind(null, moc.id)} label='Close change' variant='default' confirm='Close this change? It cannot be edited afterwards.' /> : null}
          {canManage && stepAllowed('cancel', moc.status) ? <PromptButton run={cancelMoc.bind(null, moc.id)} label='Cancel change' question='Why is this change being canceled?' variant='destructive' /> : null}
        </div>
      </div>

      {moc.status === 'canceled' ? <p className='text-sm'>Canceled: {moc.cancel_reason}</p> : null}
      {moc.status === 'approved' && blockers.implement.length ? (
        <Card>
          <CardContent className='flex flex-col gap-2 p-4' data-moc-blockers>
            <p className='text-sm font-semibold'>Before it can go into service</p>
            <List items={blockers.implement} />
          </CardContent>
        </Card>
      ) : null}
      {moc.status === 'implemented' && blockers.close.length ? (
        <Card>
          <CardContent className='flex flex-col gap-2 p-4' data-moc-blockers>
            <p className='text-sm font-semibold'>Before it can be closed</p>
            <List items={blockers.close} />
          </CardContent>
        </Card>
      ) : null}

      <div className='grid gap-6 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>The change</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className='grid gap-4 md:grid-cols-3'>
              <Detail label='Type'>{changeTypeLabel(moc.change_type)}</Detail>
              <Detail label='Location'>{locations.find(item => item.id === moc.location_id)?.name}</Detail>
              <Detail label='Equipment'>{moc.asset_id ? assets.find(item => item.id === moc.asset_id)?.name : null}</Detail>
              <Detail label='Owner'>{moc.owner_user_id ? names.get(moc.owner_user_id) : null}</Detail>
              <Detail label='Raised by'>{moc.created_by ? names.get(moc.created_by) : null}</Detail>
              <Detail label='Pre-startup review'>{moc.requires_pssr ? (moc.pssr_completed_at ? 'Signed off' : 'Needed') : 'Not needed'}</Detail>
            </dl>
            <dl className='mt-4 grid gap-4'>
              <Detail label='What is changing'>{moc.description}</Detail>
              <Detail label='Why'>{moc.reason}</Detail>
              <Detail label='Technical basis'>{moc.technical_basis}</Detail>
              <Detail label='Affects'>{(moc.impacts || []).map(impactLabel).join(', ')}</Detail>
            </dl>
            {found.phas.length ? (
              <p className='mt-4 text-sm'>
                Hazard analyses:{' '}
                {found.phas.map((pha: any) => (
                  <Link key={pha.id} href={'/process-safety/pha/' + pha.id} className='text-primary mr-2 hover:underline'>
                    {pha.pha_number}
                  </Link>
                ))}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {approvals.length ? (
              <ul className='flex flex-col gap-2 text-sm' data-moc-approvals>
                {approvals.map((item: any) => (
                  <li key={item.id} data-approval={names.get(item.approver_user_id)}>
                    <span className='font-medium'>{names.get(item.approver_user_id)}</span>
                    {item.role_label ? <span className='text-textSecondary'> · {item.role_label}</span> : null}
                    <span className={item.decision === 'approved' ? 'text-success' : item.decision === 'rejected' ? 'text-error' : 'text-textSecondary'}> · {item.decision}</span>
                    {item.comment ? <p className='text-textSecondary text-xs'>{item.comment}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className='text-textSecondary text-sm'>No approvers yet.</p>
            )}
            {editable ? (
              <ApproverForm mocId={moc.id} initial={approvals.map((item: any) => ({ userId: item.approver_user_id, role: item.role_label || '' }))} candidates={candidates} />
            ) : null}
            {canApprove && moc.status === 'in_review' && mine?.decision === 'pending' ? <DecisionForm mocId={moc.id} /> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {found.actions.length ? (
            <table className='w-full border-collapse text-sm' data-moc-actions>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4 font-semibold'>Action</th>
                  <th className='py-2 pr-4 font-semibold'>When</th>
                  <th className='py-2 pr-4 font-semibold'>Corrective Action</th>
                  <th className='py-2 font-semibold' />
                </tr>
              </thead>
              <tbody>
                {found.actions.map((item: any) => {
                  const capa = item.forge_corrective_actions

                  return (
                    <tr key={item.id} className={'border-b last:border-0 ' + (item.removed_at ? 'text-textSecondary' : '')} data-moc-action={item.title}>
                      <td className='py-2 pr-4'>
                        {item.title}
                        {item.removed_at ? <span> (removed: {item.removed_reason})</span> : null}
                      </td>
                      <td className='py-2 pr-4'>{phaseLabel(item.phase)}</td>
                      <td className='py-2 pr-4'>
                        {capa ? (
                          <Link href={'/corrective-actions/' + capa.id} className={'hover:underline ' + (actionDone(capa.status) ? 'text-success' : 'text-primary')}>
                            {capa.action_number} · {capaStatus(capa.status)}
                          </Link>
                        ) : (
                          capaStatus(null)
                        )}
                      </td>
                      <td className='py-2 text-right'>
                        {canManage && open && !item.removed_at ? <PromptButton run={removeAction.bind(null, item.id)} label='Remove' question='Why is this action being removed? Its Corrective Action stays as it is.' /> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary text-sm'>No actions yet. Add what must be done before and after startup, such as updating P&amp;IDs, procedures or training.</p>
          )}
          {canManage && open ? <ActionForm kind='moc' parentId={moc.id} personnel={personnel} phases={moc.status === 'implemented' ? ['after_startup'] : undefined} /> : null}
        </CardContent>
      </Card>

      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {found.documents.length ? (
              <ul className='flex flex-col gap-2 text-sm' data-moc-documents>
                {found.documents.map((item: any) => (
                  <li key={item.id} className='flex items-center justify-between gap-2'>
                    <Link href={'/documents/' + item.document_id} className='text-primary hover:underline'>
                      {item.forge_documents?.document_number} {item.forge_documents?.name}
                    </Link>
                    {canManage && open ? <ActionButton run={unlinkDocument.bind(null, moc.id, item.id)} label='Unlink' /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className='text-textSecondary text-sm'>No documents linked.</p>
            )}
            {canManage && open ? <DocumentLinkForm mocId={moc.id} documents={documents.filter(item => !linked.has(item.id))} /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pre-startup safety review</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            {!moc.requires_pssr ? <p className='text-textSecondary text-sm'>Not needed for this change.</p> : null}
            {moc.pssr_completed_at ? (
              <>
                <p className='text-success text-sm' data-pssr-done>
                  Signed off by {names.get(moc.pssr_completed_by) || 'Unknown user'} on {String(moc.pssr_completed_at).slice(0, 10)}.
                </p>
                <ul className='text-sm'>
                  {PSSR_ITEMS.map(item => (
                    <li key={item.key}>
                      {item.label}: <strong>{moc.pssr_answers?.[item.key]?.answer === 'na' ? 'N/A' : moc.pssr_answers?.[item.key]?.answer}</strong>
                      {moc.pssr_answers?.[item.key]?.note ? <span className='text-textSecondary'> · {moc.pssr_answers[item.key].note}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {moc.requires_pssr && !moc.pssr_completed_at && moc.status !== 'approved' ? <p className='text-textSecondary text-sm'>Done once the change is approved.</p> : null}
            {moc.requires_pssr && !moc.pssr_completed_at && moc.status === 'approved' && canPssr ? (
              blockers.pssr.length ? (
                <>
                  <p className='text-sm'>Finish the pre-startup actions first:</p>
                  <List items={blockers.pssr} />
                </>
              ) : (
                <PssrForm mocId={moc.id} />
              )
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className='flex flex-col gap-2 text-sm' data-moc-history>
            {found.activity.map((item: any) => (
              <li key={item.id}>
                <span className='text-textSecondary'>{new Date(item.created_at).toLocaleString('en-US')}</span> · {item.message}
                {item.actor_user_id ? <span className='text-textSecondary'> · {names.get(item.actor_user_id)}</span> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

export default MocPage
