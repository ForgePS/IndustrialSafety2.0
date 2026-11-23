import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { addEventAction, closeEvent, removeEventAction, reopenEvent } from '@/app/(back)/environmental/actions'
import { actionFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import PromptButton from '@/components/process-safety/PromptButton'
import { companyLocations, companyPersonnel, envRights, loadEvent, userNameMap } from '@/lib/forgeEnvironmental'
import { capaDone, eventTypeLabel, mediaLabel } from '@/lib/forgeEnvironmentalRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Environmental event' }

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className='text-textSecondary text-xs font-medium uppercase'>{label}</dt>
    <dd className='text-sm whitespace-pre-wrap'>{children || '—'}</dd>
  </div>
)

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US') : null)

/** Port slice 17: one environmental event with the agency notice, its corrective actions and closing. */
const EventPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = (await tenantPermissionOrNull('environmental.view')) || (await requireTenantPermission('environmental.report'))
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const found = await loadEvent({ organizationId, rights, id })

  if (!found) notFound()

  const { event, canManage, blockers } = found
  const open = event.status === 'open'

  const [locations, personnel, names] = await Promise.all([
    companyLocations(organizationId),
    canManage && open ? companyPersonnel(organizationId) : Promise.resolve([]),
    userNameMap([event.reported_by, event.closed_by])
  ])

  return (
    <div className='flex flex-col gap-6' data-event-page>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href='/environmental/events' className='text-primary text-sm hover:underline'>
            ← Environmental events
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>
            {event.event_number}: {eventTypeLabel(event.event_type)}
          </h1>
          <div className='mt-2 flex flex-wrap gap-3 text-sm'>
            <span className='rounded-full border px-3 py-0.5 font-medium' data-event-status>
              {open ? 'Open' : 'Closed'}
            </span>
            {event.reportable ? (
              <span className={event.agency_notified_at ? '' : 'text-error font-semibold'} data-agency-notice>
                {event.agency_notified_at ? `Reported to ${event.agency_name} ${when(event.agency_notified_at)}` : 'Reportable: agency notice not recorded'}
              </span>
            ) : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canManage && open ? (
            <Button asChild variant='outline'>
              <Link href={`/environmental/events/${event.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {canManage && open ? <PromptButton run={closeEvent.bind(null, event.id)} label='Close event' question='Closing notes (optional):' /> : null}
          {canManage && !open ? <PromptButton run={reopenEvent.bind(null, event.id)} label='Reopen' question='Why is this event being reopened?' /> : null}
        </div>
      </div>

      {open && blockers.length ? (
        <Card>
          <CardContent className='flex flex-col gap-2 p-4' data-event-blockers>
            <p className='text-sm font-semibold'>Before it can be closed</p>
            <ul className='text-warning list-disc pl-5 text-sm'>
              {blockers.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>What happened</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-4 md:grid-cols-3'>
            <Detail label='When'>{when(event.occurred_at)}</Detail>
            <Detail label='Location'>{locations.find(item => item.id === event.location_id)?.name}</Detail>
            <Detail label='Permit'>
              {found.permit ? (
                <Link href={'/environmental/permits/' + found.permit.id} className='text-primary hover:underline'>
                  {found.permit.title}
                </Link>
              ) : null}
            </Detail>
            <Detail label='Substance'>{event.substance}</Detail>
            <Detail label='Quantity'>{event.quantity === null ? null : `${event.quantity} ${event.unit}`}</Detail>
            <Detail label='Where it went'>{(event.media || []).map(mediaLabel).join(', ') + (event.contained ? ' (fully contained)' : '')}</Detail>
            <Detail label='Reported by'>{event.reported_by ? names.get(event.reported_by) : null}</Detail>
            <Detail label='Agency reference'>{event.agency_reference}</Detail>
            <Detail label='Closed'>{event.closed_at ? `${when(event.closed_at)} by ${names.get(event.closed_by) || 'Unknown user'}` : null}</Detail>
          </dl>
          <dl className='mt-4 grid gap-4'>
            <Detail label='Description'>{event.description}</Detail>
            <Detail label='Immediate actions'>{event.immediate_actions}</Detail>
            {event.closure_notes ? <Detail label='Closing notes'>{event.closure_notes}</Detail> : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Corrective actions</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {found.actions.length ? (
            <ul className='flex flex-col gap-2 text-sm' data-event-actions>
              {found.actions.map((item: any) => {
                const capa = item.forge_corrective_actions

                return (
                  <li key={item.id} className={'flex items-center justify-between gap-2 ' + (item.removed_at ? 'text-textSecondary' : '')} data-event-action={item.title}>
                    <span>
                      {item.title}
                      {item.removed_at ? ` (removed: ${item.removed_reason})` : ''}
                      {capa ? (
                        <>
                          {' · '}
                          <Link href={'/corrective-actions/' + capa.id} className={'hover:underline ' + (capaDone(capa.status) ? 'text-success' : 'text-primary')}>
                            {capa.action_number} · {String(capa.status).replace(/_/g, ' ')}
                          </Link>
                        </>
                      ) : null}
                    </span>
                    {canManage && open && !item.removed_at ? (
                      <PromptButton run={removeEventAction.bind(null, item.id)} label='Remove' question='Why is this action being removed? Its Corrective Action stays as it is.' />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No corrective actions yet.</p>
          )}
          {canManage && open ? (
            <div className='border-t pt-4'>
              <p className='mb-2 text-sm font-medium'>Add a corrective action</p>
              <FieldForm formKey='event-action' fields={actionFields(personnel)} initial={{}} action={addEventAction.bind(null, event.id)} submitLabel='Add' resetOnSuccess />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default EventPage
