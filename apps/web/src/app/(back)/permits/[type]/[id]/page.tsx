import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import { deletePermit } from '@/app/(back)/permits/actions'
import { zoneAbbreviation } from '@/app/(back)/permits/data'
import ActionButton from '@/components/emergency/ActionButton'
import GasTestPanel from '@/components/permits/GasTestPanel'
import { Detail, detailRows, hazardLabels } from '@/components/permits/PermitDetails'
import PermitChecklist from '@/components/permits/PermitChecklist'
import PermitLinksPanel from '@/components/permits/PermitLinksPanel'
import type { PermitLinkRow } from '@/components/permits/PermitLinksPanel'
import PermitPeoplePanel from '@/components/permits/PermitPeoplePanel'
import PermitTabs from '@/components/permits/PermitTabs'
import PermitWorkflowButtons from '@/components/permits/PermitWorkflowButtons'
import { formatDate, formatWhen, timeLeftLabel } from '@/components/permits/format'
import {
  companyContractorWorkers,
  companyLocations,
  companyPersonnel,
  loadPermit,
  loadPermitBundle,
  loadSpace,
  permitRights,
  rightsAt,
  userNameMap
} from '@/lib/forgePermitAccess'
import type { PermitStatus } from '@/lib/forgePermitRules'
import {
  closeBlockers,
  detailsProblem,
  mergeCheckDefinitions,
  minutesLeft,
  PERMIT_ROLE_LABELS,
  PERMIT_STATUS_LABELS,
  PERMIT_TYPE_INFO,
  permitActions,
  permitPath,
  permitStatusTone,
  permitTypeFromSlug,
  personLabel
} from '@/lib/forgePermitRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Permit' }

const db = () => createServiceRoleClient() as any

const ACTIVITY_LABELS: Record<string, string> = { created: 'Created', edited: 'Edited', linked: 'Linked', unlinked: 'Unlinked' }

/** Port slice 18: one permit, its people, checklist, gas tests, entry log, links and history. */
const PermitPage = async ({ params }: { params: Promise<{ type: string; id: string }> }) => {
  const { type: slug, id } = await params
  const type = permitTypeFromSlug(slug)

  if (!type) notFound()

  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const rights = await permitRights(organizationId, userId, context.access)
  const permit = await loadPermit(organizationId, rights, id, type)

  if (!permit) notFound()

  const bundle = await loadPermitBundle(organizationId, permit)
  const here = rightsAt(rights, permit.location_id)
  const now = new Date()
  const actions = permitActions(permit, here, userId, bundle.settings, bundle.inside.length, now)
  const open = !['closed', 'canceled'].includes(permit.status)
  const canLink = open && (here.request || here.approve || here.manage)
  const { timeZone } = bundle

  const [locations, space, people, workers, procedures, documents, asset, contractor, entryUsers] = await Promise.all([
    companyLocations(organizationId),
    permit.space_id ? loadSpace(organizationId, permit.space_id) : Promise.resolve(null),
    actions.editPeople ? companyPersonnel(organizationId) : Promise.resolve([]),
    actions.editPeople ? companyContractorWorkers(organizationId) : Promise.resolve([]),
    canLink
      ? db().from('forge_loto_procedures').select('id, procedure_number, title').eq('organization_id', organizationId).is('retired_at', null).order('procedure_number').limit(1000)
      : Promise.resolve({ data: [] }),
    canLink
      ? db().from('forge_documents').select('id, document_number, name').eq('organization_id', organizationId).is('archived_at', null).order('document_number').limit(1000)
      : Promise.resolve({ data: [] }),
    permit.asset_id ? db().from('forge_assets').select('asset_number, name').eq('organization_id', organizationId).eq('id', permit.asset_id).maybeSingle() : Promise.resolve({ data: null }),
    permit.contractor_company_id
      ? db().from('forge_contractor_companies').select('name').eq('organization_id', organizationId).eq('id', permit.contractor_company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    userNameMap(bundle.entries.flatMap(entry => [entry.entered_recorded_by, entry.exited_recorded_by]))
  ])

  const users = (userIdValue: string | null | undefined) => (userIdValue ? bundle.users.get(userIdValue) || entryUsers.get(userIdValue) || 'Unknown user' : '')
  const insideIds = new Set(bundle.inside.map(entry => entry.person_id))
  const personName = new Map(bundle.people.map(person => [person.id, personLabel(person, bundle.names.personnel, bundle.names.workers)]))
  const expired = actions.expired
  const left = minutesLeft(permit, now)
  const blockers = ['active', 'suspended'].includes(permit.status) ? closeBlockers(permit, bundle.settings, bundle.inside.length, now) : []
  const { fireWatchEnd, ...flags } = actions
  const missing = permit.status === 'draft' ? detailsProblem(type, permit.details || {}) : null

  const links: PermitLinkRow[] = bundle.links.map(link =>
    link.loto_procedure_id
      ? { id: link.id, kind: 'loto', targetId: link.loto_procedure_id, label: `${link.forge_loto_procedures?.procedure_number || ''} ${link.forge_loto_procedures?.title || ''}`.trim() }
      : { id: link.id, kind: 'document', targetId: link.document_id, label: `${link.forge_documents?.document_number || ''} ${link.forge_documents?.name || ''}`.trim() }
  )

  return (
    <div className='flex flex-col gap-6' data-permit-page={permit.permit_number}>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href={permitPath(type)} className='text-primary text-sm hover:underline'>
            ← {PERMIT_TYPE_INFO[type].label}
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>
            {permit.permit_number}: {permit.title}
          </h1>
          <div className='mt-2 flex flex-wrap items-center gap-3 text-sm'>
            <Badge variant={permitStatusTone(permit.status, expired)} data-permit-status={permit.status}>
              {PERMIT_STATUS_LABELS[permit.status as PermitStatus] || permit.status}
            </Badge>
            {expired ? (
              <span className='text-error font-semibold' data-permit-expired>
                Past its end time
              </span>
            ) : null}
            {left !== null ? (
              <span className={left < 60 ? 'text-error font-semibold' : 'text-textSecondary'} data-permit-time-left>
                {timeLeftLabel(left)}
              </span>
            ) : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {actions.edit ? (
            <Button asChild variant='outline'>
              <Link href={permitPath(type, permit.id) + '/edit'}>Edit</Link>
            </Button>
          ) : null}
          <Button asChild variant='outline'>
            <Link href={permitPath(type, permit.id) + '/print'} data-print-permit>
              Print
            </Link>
          </Button>
          {actions.delete ? <ActionButton run={deletePermit.bind(null, permit.id)} label='Delete draft' variant='destructive' confirm='Delete this draft permit?' goTo={permitPath(type)} /> : null}
        </div>
      </div>
      <PermitTabs active={slug} canManage={Boolean(rights.manage)} />

      {permit.status === 'draft' && permit.reject_reason && permit.rejected_at ? (
        <p className='border-error text-error rounded-md border p-3 text-sm' data-permit-rejected>
          Sent back by {users(permit.rejected_by)} on {formatWhen(permit.rejected_at, timeZone)}: {permit.reject_reason}
        </p>
      ) : null}
      {permit.status === 'suspended' ? (
        <p className='border-error text-error rounded-md border p-3 text-sm font-semibold' data-permit-suspended>
          Suspended {formatWhen(permit.suspended_at, timeZone)}: {permit.suspend_reason}
        </p>
      ) : null}
      {missing ? (
        <p className='border-warning text-warning rounded-md border p-3 text-sm' data-details-warning>
          Still needed before you submit: {missing}
        </p>
      ) : null}
      {bundle.gaps.length ? (
        <div className='border-warning rounded-md border p-3 text-sm' data-training-gaps>
          <p className='text-warning font-semibold'>
            Missing training{bundle.settings.require_training ? ' (blocks approval)' : ''}
          </p>
          <ul className='mt-1 list-disc pl-5'>
            {bundle.gaps.map(gap => (
              <li key={gap.person_row_id + gap.course_id}>
                {gap.person_name} ({PERMIT_ROLE_LABELS[gap.role] || gap.role}): {gap.course_title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Next steps</CardTitle>
        </CardHeader>
        <CardContent>
          <PermitWorkflowButtons
            permitId={permit.id}
            permitType={type}
            actions={flags}
            fireWatchEnd={fireWatchEnd ? fireWatchEnd.toISOString() : null}
            closeBlockers={blockers}
            timeZone={timeZone}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The work</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <dl className='grid gap-4 md:grid-cols-3'>
            <Detail label='Location'>{locations.find(item => item.id === permit.location_id)?.name}</Detail>
            <Detail label='Work area'>{permit.work_area}</Detail>
            <Detail label='Equipment'>{asset.data ? `${asset.data.asset_number} ${asset.data.name}` : ''}</Detail>
            <Detail label='Contractor'>{contractor.data?.name || ''}</Detail>
            <Detail label={`Valid from (${zoneAbbreviation(timeZone)})`}>{formatWhen(permit.valid_from, timeZone)}</Detail>
            <Detail label='Valid until'>{formatWhen(permit.valid_until, timeZone)}</Detail>
          </dl>
          <dl>
            <Detail label='Work description'>{permit.work_description}</Detail>
          </dl>
          <dl className='grid gap-4 md:grid-cols-3' data-permit-type-details>
            {detailRows(type, permit.details || {}).map(row => (
              <Detail key={row.label} label={row.label}>
                {row.value}
              </Detail>
            ))}
          </dl>
          <dl className='grid gap-4 md:grid-cols-3 text-sm'>
            <Detail label='Requested'>{permit.requested_at ? `${users(permit.requested_by)}, ${formatWhen(permit.requested_at, timeZone)}` : ''}</Detail>
            <Detail label='Approved'>
              {permit.approved_at ? `${users(permit.approved_by)}, ${formatWhen(permit.approved_at, timeZone)}${permit.approval_note ? ` (${permit.approval_note})` : ''}` : ''}
            </Detail>
            <Detail label='Issued'>{permit.issued_at ? `${users(permit.issued_by)}, ${formatWhen(permit.issued_at, timeZone)}` : ''}</Detail>
            {permit.work_completed_at ? <Detail label='Work complete'>{`${users(permit.work_completed_by)}, ${formatWhen(permit.work_completed_at, timeZone)}`}</Detail> : null}
            {permit.closed_at ? <Detail label='Closed'>{`${users(permit.closed_by)}, ${formatWhen(permit.closed_at, timeZone)}${permit.close_note ? ` (${permit.close_note})` : ''}`}</Detail> : null}
            {permit.canceled_at ? <Detail label='Canceled'>{`${users(permit.canceled_by)}, ${formatWhen(permit.canceled_at, timeZone)}: ${permit.cancel_reason}`}</Detail> : null}
          </dl>
        </CardContent>
      </Card>

      {space ? (
        <Card data-permit-space>
          <CardHeader>
            <CardTitle>
              Space:{' '}
              <Link href={`/permits/confined-space/spaces/${space.id}`} className='text-primary hover:underline'>
                {space.space_code ? space.space_code + ' ' : ''}
                {space.name}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className='grid gap-4 md:grid-cols-2'>
              <Detail label='Hazards'>{hazardLabels(space.hazards)}</Detail>
              <Detail label='Entry points'>{space.entry_points}</Detail>
              <Detail label='Isolation'>{space.isolation_notes}</Detail>
              <Detail label='Rescue plan'>{space.rescue_plan}</Detail>
              <Detail label='Last evaluated'>{formatDate(space.last_evaluated_on)}</Detail>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
        </CardHeader>
        <CardContent>
          <PermitPeoplePanel
            permitId={permit.id}
            permitType={type}
            people={bundle.people.map(person => ({ id: person.id, role: person.role, name: personName.get(person.id) || '', removed_at: person.removed_at || null, inside: insideIds.has(person.id) }))}
            personnelOptions={people.map(item => ({ id: item.id, name: item.name }))}
            workerOptions={workers.map(item => ({ id: item.id, name: item.name + (item.companyName ? ` (${item.companyName})` : '') }))}
            canEdit={actions.editPeople}
            canSignIn={actions.signIn}
            canSignOut={actions.signOut}
            gaps={bundle.gaps.map(gap => ({ person_row_id: gap.person_row_id, course_title: gap.course_title }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <PermitChecklist
            permitId={permit.id}
            items={mergeCheckDefinitions(bundle.definitions).map(item => ({ check_key: item.check_key, label: item.label, required: item.required, allow_na: item.allow_na }))}
            answers={bundle.answers.map(answer => ({ check_key: answer.check_key, answer: answer.answer, note: answer.note }))}
            canEdit={actions.editChecklist}
          />
        </CardContent>
      </Card>

      {type === 'confined_space' || type === 'hot_work' ? (
        <Card>
          <CardHeader>
            <CardTitle>Gas tests</CardTitle>
          </CardHeader>
          <CardContent>
            <GasTestPanel permitId={permit.id} permitType={type} tests={bundle.gasTests} settings={bundle.settings} canRecord={actions.recordGasTest} timeZone={timeZone} />
          </CardContent>
        </Card>
      ) : null}

      {type === 'confined_space' ? (
        <Card>
          <CardHeader>
            <CardTitle>Entry log</CardTitle>
          </CardHeader>
          <CardContent className='overflow-x-auto p-0'>
            {bundle.entries.length ? (
              <table className='w-full border-collapse text-sm' data-entry-log>
                <thead>
                  <tr className='border-b text-left'>
                    <th className='px-4 py-2 font-semibold'>Who</th>
                    <th className='px-4 py-2 font-semibold'>In</th>
                    <th className='px-4 py-2 font-semibold'>Out</th>
                    <th className='px-4 py-2 font-semibold'>Recorded by</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.entries.map(entry => (
                    <tr key={entry.id} className='border-b last:border-0' data-entry-row={personName.get(entry.person_id) || ''}>
                      <td className='px-4 py-2'>{personName.get(entry.person_id) || 'Unknown'}</td>
                      <td className='px-4 py-2'>{formatWhen(entry.entered_at, timeZone)}</td>
                      <td className='px-4 py-2'>{entry.exited_at ? formatWhen(entry.exited_at, timeZone) : <span className='text-warning font-semibold'>Still inside</span>}</td>
                      <td className='px-4 py-2'>
                        {users(entry.entered_recorded_by)}
                        {entry.exited_recorded_by ? ` / ${users(entry.exited_recorded_by)}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className='text-textSecondary p-4 text-sm'>No one has signed in yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Lockout procedures and documents</CardTitle>
        </CardHeader>
        <CardContent>
          <PermitLinksPanel
            permitId={permit.id}
            links={links}
            procedures={((procedures.data || []) as any[]).map(item => ({ id: item.id, name: `${item.procedure_number} ${item.title}` }))}
            documents={((documents.data || []) as any[]).map(item => ({ id: item.id, name: `${item.document_number} ${item.name}` }))}
            canEdit={canLink}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {bundle.activity.length ? (
            <ul className='flex flex-col gap-1 text-sm' data-permit-history>
              {bundle.activity.map(row => (
                <li key={row.id}>
                  <span className='text-textSecondary'>{formatWhen(row.created_at, timeZone)}</span> · {users(row.actor_user_id) || 'System'} ·{' '}
                  <span className='font-medium'>{ACTIVITY_LABELS[row.action] || row.action.replace(/_/g, ' ')}</span>
                  {row.detail ? `: ${row.detail}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>Nothing yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default PermitPage
