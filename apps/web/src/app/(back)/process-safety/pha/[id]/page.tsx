import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { archivePha, removeAction } from '@/app/(back)/process-safety/actions'
import ActionButton from '@/components/emergency/ActionButton'
import ActionForm from '@/components/process-safety/ActionForm'
import PromptButton from '@/components/process-safety/PromptButton'
import { companyLocations, companyPersonnel, loadPha, psmRights, todayIso, userNameMap } from '@/lib/forgeProcessSafety'
import { actionDone, phaMethodLabel, phaStatusLabel, revalidationState } from '@/lib/forgeProcessSafetyRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Process hazard analysis' }

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className='text-textSecondary text-xs font-medium uppercase'>{label}</dt>
    <dd className='text-sm whitespace-pre-wrap'>{children || '—'}</dd>
  </div>
)

/** Port slice 16: one process hazard analysis with its recommendations (each a Corrective Action). */
const PhaPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('process_safety.view')
  const organizationId = context.activeOrganization.id
  const rights = await psmRights(organizationId, context.user.id, context.access)
  const found = await loadPha({ organizationId, rights, id })

  if (!found) notFound()

  const { pha, canManage } = found
  const editable = canManage && !pha.archived_at
  const state = revalidationState(pha.revalidate_by, todayIso())

  const [locations, personnel, names] = await Promise.all([
    companyLocations(organizationId),
    editable ? companyPersonnel(organizationId) : Promise.resolve([]),
    userNameMap(found.activity.map((item: any) => item.actor_user_id))
  ])

  return (
    <div className='flex flex-col gap-6' data-pha-page>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href='/process-safety/pha' className='text-primary text-sm hover:underline'>
            ← Hazard analyses
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>
            {pha.pha_number}: {pha.title}
          </h1>
          <div className='mt-2 flex flex-wrap gap-3 text-sm'>
            <span className='rounded-full border px-3 py-0.5 font-medium'>{phaStatusLabel(pha.status)}</span>
            {pha.revalidate_by ? (
              <span className={state === 'overdue' ? 'text-error font-semibold' : state === 'due_soon' ? 'text-warning font-semibold' : ''} data-revalidation={state}>
                Revalidate by {pha.revalidate_by}
                {state === 'overdue' ? ' (overdue)' : state === 'due_soon' ? ' (due soon)' : ''}
              </span>
            ) : null}
            {pha.archived_at ? <span className='text-textSecondary'>Archived</span> : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {editable ? (
            <Button asChild variant='outline'>
              <Link href={`/process-safety/pha/${pha.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {canManage ? <ActionButton run={archivePha.bind(null, pha.id, !pha.archived_at)} label={pha.archived_at ? 'Restore' : 'Archive'} confirm={pha.archived_at ? undefined : 'Archive this study?'} /> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>The study</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-4 md:grid-cols-3'>
            <Detail label='Process or unit'>{pha.process_unit}</Detail>
            <Detail label='Location'>{locations.find(item => item.id === pha.location_id)?.name}</Detail>
            <Detail label='Method'>{phaMethodLabel(pha.method)}</Detail>
            <Detail label='Team leader'>{pha.leader_name}</Detail>
            <Detail label='Started'>{pha.started_on}</Detail>
            <Detail label='Completed'>{pha.completed_on}</Detail>
            <Detail label='Related change'>
              {found.moc ? (
                <Link href={'/process-safety/changes/' + found.moc.id} className='text-primary hover:underline'>
                  {found.moc.moc_number}
                </Link>
              ) : null}
            </Detail>
          </dl>
          <dl className='mt-4 grid gap-4'>
            <Detail label='Team'>{pha.team}</Detail>
            <Detail label='Summary and findings'>{pha.summary}</Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {found.actions.length ? (
            <ul className='flex flex-col gap-2 text-sm' data-pha-recommendations>
              {found.actions.map((item: any) => {
                const capa = item.forge_corrective_actions

                return (
                  <li key={item.id} className={'flex items-center justify-between gap-2 ' + (item.removed_at ? 'text-textSecondary' : '')} data-pha-recommendation={item.title}>
                    <span>
                      {item.title}
                      {item.removed_at ? ` (removed: ${item.removed_reason})` : ''}
                      {capa ? (
                        <>
                          {' · '}
                          <Link href={'/corrective-actions/' + capa.id} className={'hover:underline ' + (actionDone(capa.status) ? 'text-success' : 'text-primary')}>
                            {capa.action_number} · {String(capa.status).replace(/_/g, ' ')}
                          </Link>
                        </>
                      ) : null}
                    </span>
                    {editable && !item.removed_at ? <PromptButton run={removeAction.bind(null, item.id)} label='Remove' question='Why is this recommendation being removed? Its Corrective Action stays as it is.' /> : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No recommendations yet.</p>
          )}
          {editable ? <ActionForm kind='pha' parentId={pha.id} personnel={personnel} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className='flex flex-col gap-2 text-sm'>
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

export default PhaPage
