import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { archivePlan } from '@/app/(back)/emergency/actions'
import ActionButton from '@/components/emergency/ActionButton'
import TeamMembersForm from '@/components/emergency/TeamMembersForm'
import { activePersonnel, listPlans, loadPlan, teamMembers } from '@/lib/forgeEmergency'
import { DRILL_STATUSES, PLAN_STATUSES, planKindLabel, reviewState } from '@/lib/forgeEmergencyRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Emergency record' }

const humanize = (key: string | null) => (key ? key.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()) : '—')

/** Port slice 14: one plan, scenario, drill or response team. */
const EmergencyPlanPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('emergency_management.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const plan = await loadPlan({ organizationId, userId, access: context.access, id })

  if (!plan) notFound()

  const [all, members, people] = await Promise.all([
    listPlans({ organizationId, userId, access: context.access }),
    plan.kind === 'team' ? teamMembers(plan.id) : Promise.resolve([]),
    plan.kind === 'team' && plan.canEdit ? activePersonnel(organizationId) : Promise.resolve([])
  ])

  const parent = plan.plan_id ? all.find((item: any) => item.id === plan.plan_id) : null
  const linked = plan.kind === 'plan' ? all.filter((item: any) => item.plan_id === plan.id) : []
  const status = ((plan.kind === 'drill' ? DRILL_STATUSES : PLAN_STATUSES) as readonly { key: string; label: string }[]).find(item => item.key === plan.status)?.label
  const review = reviewState(plan.review_due_on, new Date().toISOString().slice(0, 10))

  const facts: [string, string][] = [
    ['Kind', planKindLabel(plan.kind)],
    ['Status', status || plan.status],
    ['Location', plan.locations?.name || 'Company-wide'],
    ...(plan.scenario_type ? ([['Emergency type', humanize(plan.scenario_type)]] as [string, string][]) : []),
    ...(plan.kind === 'drill'
      ? ([
          ['Drill date', plan.event_date],
          ['Participants', plan.participants ?? '—'],
          ['Duration', plan.duration_minutes !== null ? plan.duration_minutes + ' minutes' : '—']
        ] as [string, string][])
      : ([['Next review', plan.review_due_on ? plan.review_due_on + (review === 'overdue' ? ' (overdue)' : review === 'due_soon' ? ' (due soon)' : '') : '—']] as [string, string][]))
  ]

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href={'/emergency?kind=' + plan.kind} className='text-textSecondary text-sm hover:underline'>
            ← Emergency plans
          </Link>
          <h1 className='text-textPrimary mt-2 text-3xl font-bold'>{plan.title}</h1>
          {plan.archived_at ? <p className='text-warning mt-1 text-sm font-semibold'>Archived</p> : null}
          {plan.summary ? <p className='text-textSecondary mt-2 max-w-3xl'>{plan.summary}</p> : null}
        </div>
        {plan.canEdit ? (
          <div className='flex gap-2'>
            {!plan.archived_at ? (
              <Button asChild variant='outline'>
                <Link href={'/emergency/' + plan.id + '/edit'}>Edit</Link>
              </Button>
            ) : null}
            <ActionButton
              run={archivePlan.bind(null, plan.id, !plan.archived_at)}
              label={plan.archived_at ? 'Restore' : 'Archive'}
              confirm={plan.archived_at ? undefined : `Archive "${plan.title}"?`}
            />
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent className='grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3'>
          {facts.map(([label, value]) => (
            <div key={label}>
              <div className='text-textSecondary text-xs'>{label}</div>
              <div className='font-medium'>{value}</div>
            </div>
          ))}
          {parent ? (
            <div>
              <div className='text-textSecondary text-xs'>Action plan</div>
              <Link href={'/emergency/' + parent.id} className='text-primary font-medium hover:underline'>
                {parent.title}
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {plan.body ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>{plan.kind === 'drill' ? 'Drill plan and notes' : plan.kind === 'team' ? 'Duties' : 'Procedure'}</CardTitle>
          </CardHeader>
          <CardContent className='text-sm whitespace-pre-line'>{plan.body}</CardContent>
        </Card>
      ) : null}

      {plan.kind === 'drill' ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>After-action review</CardTitle>
          </CardHeader>
          <CardContent className='text-sm whitespace-pre-line' data-emergency-after-action>
            {plan.after_action || <span className='text-textSecondary'>Not written yet.</span>}
          </CardContent>
        </Card>
      ) : null}

      {plan.kind === 'team' ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Team members</CardTitle>
          </CardHeader>
          <CardContent>
            {plan.canEdit && !plan.archived_at ? (
              <TeamMembersForm
                teamId={plan.id}
                initial={members.map((member: any) => ({ personnelId: member.personnelId, role: member.role || '' }))}
                people={people.filter(person => !person.archived && person.status === 'active').map(person => ({ id: person.id, name: person.name }))}
              />
            ) : members.length ? (
              <table className='w-full text-sm' data-emergency-team>
                <tbody>
                  {members.map((member: any) => (
                    <tr key={member.personnelId} className='border-b last:border-0'>
                      <td className='py-2 font-medium'>{member.name}</td>
                      <td className='py-2'>{member.role || '—'}</td>
                      <td className='py-2'>{member.jobTitle || ''}</td>
                      <td className='py-2'>{member.phone || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className='text-textSecondary text-sm'>Nobody is on this team yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {plan.kind === 'plan' && linked.length ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Scenarios and drills for this plan</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='flex flex-col gap-1 text-sm'>
              {linked.map((item: any) => (
                <li key={item.id}>
                  <Link href={'/emergency/' + item.id} className='text-primary hover:underline'>
                    {item.title}
                  </Link>{' '}
                  <span className='text-textSecondary'>
                    ({planKindLabel(item.kind).toLowerCase()}
                    {item.event_date ? ', ' + item.event_date : ''})
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default EmergencyPlanPage
