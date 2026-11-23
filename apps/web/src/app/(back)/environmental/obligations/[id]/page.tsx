import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { completeObligation, setObligationActive } from '@/app/(back)/environmental/actions'
import ActionButton from '@/components/emergency/ActionButton'
import { completionFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import { companyLocations, envRights, loadObligation, todayIso, userNameMap } from '@/lib/forgeEnvironmental'
import { frequencyLabel, obligationState, obligationTypeLabel } from '@/lib/forgeEnvironmentalRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Environmental obligation' }

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className='text-textSecondary text-xs font-medium uppercase'>{label}</dt>
    <dd className='text-sm whitespace-pre-wrap'>{children || '—'}</dd>
  </div>
)

/** Port slice 17: one obligation, recording each time it's done. */
const ObligationPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('environmental.view')
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const found = await loadObligation({ organizationId, rights, id })

  if (!found) notFound()

  const { obligation: item, canManage, completions } = found
  const today = todayIso()
  const state = obligationState(item, today)
  const [locations, names] = await Promise.all([companyLocations(organizationId), userNameMap([item.owner_user_id, ...completions.map((row: any) => row.completed_by)])])

  return (
    <div className='flex flex-col gap-6' data-obligation-page>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href='/environmental/obligations' className='text-primary text-sm hover:underline'>
            ← Obligations
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{item.title}</h1>
          <p className={'mt-2 text-sm ' + (state === 'overdue' ? 'text-error font-semibold' : state === 'due_soon' ? 'text-warning font-semibold' : '')} data-obligation-state={state}>
            {state === 'inactive' ? (item.next_due_on ? 'Paused' : 'Done (one time)') : `${state === 'overdue' ? 'Overdue since' : 'Next due'} ${item.next_due_on}`}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canManage ? (
            <Button asChild variant='outline'>
              <Link href={`/environmental/obligations/${item.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {canManage && item.next_due_on ? <ActionButton run={setObligationActive.bind(null, item.id, !item.active)} label={item.active ? 'Pause' : 'Resume'} /> : null}
        </div>
      </div>
      <Card>
        <CardContent className='p-6'>
          <dl className='grid gap-4 md:grid-cols-3'>
            <Detail label='Type'>{obligationTypeLabel(item.obligation_type)}</Detail>
            <Detail label='How often'>{frequencyLabel(item.frequency)}</Detail>
            <Detail label='Location'>{locations.find(location => location.id === item.location_id)?.name}</Detail>
            <Detail label='Permit'>
              {item.forge_env_permits ? (
                <Link href={'/environmental/permits/' + item.forge_env_permits.id} className='text-primary hover:underline'>
                  {item.forge_env_permits.title}
                </Link>
              ) : null}
            </Detail>
            <Detail label='Owner'>{item.owner_user_id ? names.get(item.owner_user_id) : null}</Detail>
          </dl>
          {item.notes ? <p className='mt-4 text-sm whitespace-pre-wrap'>{item.notes}</p> : null}
        </CardContent>
      </Card>
      {canManage && item.active ? (
        <Card>
          <CardHeader>
            <CardTitle>Record the one due {item.next_due_on} as done</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldForm formKey='completion' fields={completionFields} initial={{ completedOn: today, result: 'done' }} action={completeObligation.bind(null, item.id)} submitLabel='Record' />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Done</CardTitle>
        </CardHeader>
        <CardContent>
          {completions.length ? (
            <table className='w-full border-collapse text-sm' data-completions>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4 font-semibold'>Due</th>
                  <th className='py-2 pr-4 font-semibold'>Done</th>
                  <th className='py-2 pr-4 font-semibold'>Result</th>
                  <th className='py-2 font-semibold'>By</th>
                </tr>
              </thead>
              <tbody>
                {completions.map((row: any) => (
                  <tr key={row.id} className='border-b last:border-0' data-completion={row.due_on}>
                    <td className='py-2 pr-4'>{row.due_on}</td>
                    <td className={'py-2 pr-4 ' + (row.completed_on > row.due_on ? 'text-warning' : '')}>
                      {row.completed_on}
                      {row.completed_on > row.due_on ? ' (late)' : ''}
                    </td>
                    <td className='py-2 pr-4'>
                      {row.result === 'issue' ? <span className='text-error font-semibold'>Problem found</span> : 'No problems'}
                      {row.notes ? <p className='text-textSecondary text-xs'>{row.notes}</p> : null}
                    </td>
                    <td className='py-2'>{names.get(row.completed_by) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary text-sm'>Nothing recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ObligationPage
