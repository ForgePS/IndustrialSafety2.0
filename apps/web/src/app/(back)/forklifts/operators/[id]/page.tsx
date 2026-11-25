import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import IncidentLinksPanel from '@/components/forklifts/IncidentLinksPanel'
import OperatorStatusButtons from '@/components/forklifts/OperatorStatusButtons'
import { formatWhen } from '@/components/permits/format'
import { forkliftRights, listChecks, loadActivity, loadOperator, locationNames, recentIncidents, rightsAt, userNameMap } from '@/lib/forgeForkliftAccess'
import { operatorStandings } from '@/lib/forgeForkliftOperators'
import type { TruckClass } from '@/lib/forgeForkliftRules'
import { daysBetween, formatDate, operatorActions, STANDING_LABELS, standingTone, TRUCK_CLASS_INFO } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forklift operator' }

const ACTIVITY_LABELS: Record<string, string> = {
  authorized: 'Authorized',
  renewed: 'Re-evaluated',
  suspended: 'Suspended',
  reinstated: 'Reinstated',
  revoked: 'Revoked',
  refresher_required: 'Refresher required',
  incident_linked: 'Incident linked',
  incident_unlinked: 'Incident unlinked'
}

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className='text-textSecondary text-xs font-semibold uppercase'>{label}</dt>
    <dd className='mt-1 whitespace-pre-wrap text-sm'>{children || <span className='text-textSecondary'>None</span>}</dd>
  </div>
)

/** Port slice 19: one operator's authorization, standing, status actions, pre-shift checks, incidents and history. */
const OperatorPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const operator = await loadOperator(organizationId, rights, id)

  if (!operator) notFound()

  const here = rightsAt(rights, operator.person.locationId)

  const isSelf = await (async () => {
    const { data } = await (createServiceRoleClient() as any).from('forge_personnel').select('auth_user_id').eq('id', operator.personnel_id).maybeSingle()

    return Boolean(data?.auth_user_id) && data.auth_user_id === context.user.id
  })()

  const canAuthorize = here.authorize && !isSelf
  const actions = canAuthorize ? operatorActions(operator) : []

  const [{ standings, settings, timeZone, today, trained }, checks, activity, locations, incidents] = await Promise.all([
    operatorStandings(organizationId, [operator]),
    listChecks({ organizationId, operatorPersonnelId: operator.personnel_id, limit: 20 }),
    loadActivity({ operatorId: operator.id }),
    locationNames(organizationId),
    actions.includes('require_refresher') ? recentIncidents(organizationId) : Promise.resolve([])
  ])

  const standing = standings.get(operator.id) || 'none'
  const users = await userNameMap([operator.authorized_by, operator.suspended_by, operator.revoked_by, ...activity.map(row => row.actor_user_id)])
  const user = (value: string | null | undefined) => (value ? users.get(value) || 'Unknown user' : '')
  const supabase = createServiceRoleClient() as any
  const truckIds = [...new Set(checks.map(check => check.forklift_id))]

  const [{ data: trucks }, { data: refresherIncident }] = await Promise.all([
    truckIds.length ? supabase.from('forge_forklifts').select('id, forge_assets(asset_number, name)').in('id', truckIds) : Promise.resolve({ data: [] }),
    operator.refresher_incident_id
      ? supabase.from('forge_incidents').select('id, incident_number').eq('organization_id', organizationId).eq('id', operator.refresher_incident_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])

  const truckName = new Map(((trucks || []) as any[]).map(row => [row.id, `${row.forge_assets?.asset_number || ''} ${row.forge_assets?.name || ''}`.trim()]))
  const left = daysBetween(today, operator.expires_on)

  return (
    <div className='flex flex-col gap-6' data-operator-page={operator.person.name}>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href='/forklifts/operators' className='text-primary text-sm hover:underline'>
            ← Operators
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{operator.person.name}</h1>
          <div className='mt-2 flex flex-wrap items-center gap-3 text-sm'>
            <Badge variant={standingTone(standing)} data-operator-standing={standing}>
              {STANDING_LABELS[standing]}
            </Badge>
            <span className='text-textSecondary'>
              {operator.person.employeeNumber ? `${operator.person.employeeNumber} · ` : ''}
              {locations.get(operator.person.locationId || '') || 'No location'}
            </span>
            <Link href={`/personnel/${operator.personnel_id}`} className='text-primary hover:underline'>
              Personnel record
            </Link>
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button asChild variant='outline'>
            <Link href={`/forklifts/operators/${operator.id}/card`} data-wallet-card>
              Wallet card
            </Link>
          </Button>
          {canAuthorize ? (
            <Button asChild>
              <Link href={`/forklifts/operators/${operator.id}/evaluate`} data-new-evaluation>
                Record a new evaluation
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <ForkliftTabs active='operators' canManage={Boolean(rights.manage)} />

      {operator.status === 'revoked' ? (
        <p className='border-error text-error rounded-md border p-3 text-sm font-semibold' data-operator-revoked>
          Revoked {formatWhen(operator.revoked_at, timeZone)}
          {operator.revoked_by ? ` by ${user(operator.revoked_by)}` : ''}: {operator.revoke_reason}
        </p>
      ) : null}
      {operator.status === 'suspended' ? (
        <p className='border-error text-error rounded-md border p-3 text-sm font-semibold' data-operator-suspended>
          Suspended {formatWhen(operator.suspended_at, timeZone)}
          {operator.suspended_by ? ` by ${user(operator.suspended_by)}` : ''}: {operator.suspend_reason}
        </p>
      ) : null}
      {operator.refresher_required ? (
        <p className='border-error text-error rounded-md border p-3 text-sm' data-operator-refresher>
          <span className='font-semibold'>Refresher training and a new evaluation are required</span> ({formatWhen(operator.refresher_required_at, timeZone)}): {operator.refresher_reason}
          {refresherIncident ? (
            <>
              {' '}
              ·{' '}
              <Link href={`/incidents/${refresherIncident.id}`} className='text-primary hover:underline'>
                {refresherIncident.incident_number}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {standing === 'expired' ? (
        <p className='border-error text-error rounded-md border p-3 text-sm font-semibold' data-operator-expired>
          The evaluation expired on {formatDate(operator.expires_on)}. Evaluate the operator again before they operate.
        </p>
      ) : null}
      {standing === 'expiring' ? (
        <p className='border-warning text-warning rounded-md border p-3 text-sm' data-operator-expiring>
          Re-evaluation due by {formatDate(operator.expires_on)} ({left === 0 ? 'today' : `${left} day${left === 1 ? '' : 's'}`}).
        </p>
      ) : null}
      {standing === 'training' ? (
        <p className='border-error text-error rounded-md border p-3 text-sm' data-operator-training>
          The required forklift training course is not current. Record a current completion before the operator does pre-shift checks.
        </p>
      ) : null}

      {actions.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Authorization</CardTitle>
          </CardHeader>
          <CardContent>
            <OperatorStatusButtons
              operatorId={operator.id}
              actions={actions}
              incidents={incidents.filter(item => rightsAt(rights, item.location_id).authorize).map(item => ({ id: item.id, label: `${item.incident_number} · ${item.summary}`.slice(0, 120) }))}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Training and evaluation</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-4 md:grid-cols-3'>
            <Detail label='Truck classes'>
              <ul data-operator-classes>
                {operator.truck_classes.map(value => (
                  <li key={value}>
                    {TRUCK_CLASS_INFO[value as TruckClass]?.label || value}
                    <span className='text-textSecondary'> · {TRUCK_CLASS_INFO[value as TruckClass]?.description}</span>
                  </li>
                ))}
              </ul>
            </Detail>
            <Detail label='Training completed'>{formatDate(operator.training_completed_on)}</Detail>
            <Detail label='Evaluated'>{formatDate(operator.evaluated_on)}</Detail>
            <Detail label='Evaluator'>{operator.evaluator_name}</Detail>
            <Detail label='Expires'>
              <span data-operator-expires={operator.expires_on}>{formatDate(operator.expires_on)}</span>
              <span className='text-textSecondary'> ({settings.evaluation_months} months after the evaluation)</span>
            </Detail>
            <Detail label='Authorized'>{`${user(operator.authorized_by) || 'Unknown'}, ${formatWhen(operator.authorized_at, timeZone)}`}</Detail>
            <Detail label='Restrictions'>
              <span data-operator-restrictions>{operator.restrictions}</span>
            </Detail>
            <Detail label='Evaluation notes'>{operator.evaluation_notes}</Detail>
            {trained ? <Detail label='Required training'>{trained.has(operator.personnel_id) ? 'Current' : 'Not current'}</Detail> : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent pre-shift checks</CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto p-0'>
          {checks.length ? (
            <table className='w-full border-collapse text-sm' data-operator-checks>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>When</th>
                  <th className='px-4 py-2 font-semibold'>Truck</th>
                  <th className='px-4 py-2 font-semibold'>Result</th>
                </tr>
              </thead>
              <tbody>
                {checks.map(check => (
                  <tr key={check.id} className='border-b last:border-0'>
                    <td className='px-4 py-2'>{formatWhen(check.performed_at, timeZone)}</td>
                    <td className='px-4 py-2'>
                      <Link href={`/forklifts/trucks/${check.forklift_id}`} className='text-primary hover:underline'>
                        {truckName.get(check.forklift_id) || 'Forklift'}
                      </Link>
                    </td>
                    <td className='px-4 py-2'>
                      <Badge variant={check.result === 'pass' ? 'default' : 'destructive'}>{check.result === 'pass' ? 'Pass' : 'Fail'}</Badge>
                      {check.took_out_of_service ? <span className='text-error ml-2 text-xs font-semibold'>Took the truck out of service</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary p-4 text-sm'>No pre-shift checks by this operator.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <IncidentLinksPanel organizationId={organizationId} operatorId={operator.id} canManage={here.manage} canRequireRefresher={canAuthorize && !operator.refresher_required && operator.status !== 'revoked'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length ? (
            <ul className='flex flex-col gap-1 text-sm' data-operator-history>
              {activity.map(row => (
                <li key={row.id}>
                  <span className='text-textSecondary'>{formatWhen(row.created_at, timeZone)}</span> · {row.actor_name || user(row.actor_user_id) || 'System'} ·{' '}
                  <span className='font-medium'>{ACTIVITY_LABELS[row.action] || row.action.replace(/_/g, ' ')}</span>
                  {row.message ? `: ${row.message}` : ''}
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

export default OperatorPage
