import type { Metadata } from 'next'
import Link from 'next/link'
import { TbUrgent } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { PLAN_TABS } from '@/components/emergency/tabs'
import { grantOf, listPlans } from '@/lib/forgeEmergency'
import { DRILL_STATUSES, PLAN_KINDS, PLAN_STATUSES, isPlanKind, reviewState } from '@/lib/forgeEmergencyRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Emergency Plans' }

const statusLabel = (kind: string, status: string) => ((kind === 'drill' ? DRILL_STATUSES : PLAN_STATUSES) as readonly { key: string; label: string }[]).find(item => item.key === status)?.label || status

/** Port slice 14: emergency action plans, scenario procedures, drills and response teams. */
const EmergencyPlansPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('emergency_management.view')
  const query = await searchParams
  const archived = query.archived === '1'
  const kind = isPlanKind(query.kind) ? query.kind : 'plan'
  const today = new Date().toISOString().slice(0, 10)
  const canEdit = Boolean(grantOf(context.access, 'emergency_management.edit'))

  const plans = (await listPlans({ organizationId: context.activeOrganization.id, userId: context.user.id, access: context.access, archived })).filter(
    (plan: any) => archived || plan.kind === kind
  )

  const kindInfo = PLAN_KINDS.find(item => item.key === kind)!

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbUrgent />
            Emergency Plans
          </h1>
          <p className='text-textSecondary mt-2'>Action plans, scenario procedures, drills with after-action reviews, and response teams.</p>
        </div>
        {canEdit && !archived ? (
          <Button asChild>
            <Link href={'/emergency/new?kind=' + kind}>New {kindInfo.label.toLowerCase()}</Link>
          </Button>
        ) : null}
      </div>
      <EmergencyTabs tabs={PLAN_TABS} current={archived ? 'archived' : kind} label='Emergency plans' />
      {plans.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-emergency-plans>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Title</th>
                  {archived ? <th className='px-4 py-2 font-semibold'>Kind</th> : null}
                  <th className='px-4 py-2 font-semibold'>Status</th>
                  <th className='px-4 py-2 font-semibold'>Location</th>
                  <th className='px-4 py-2 font-semibold'>{kind === 'drill' && !archived ? 'Drill date' : 'Next review'}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan: any) => {
                  const review = reviewState(plan.review_due_on, today)

                  return (
                    <tr key={plan.id} className='border-b last:border-0' data-emergency-plan={plan.title}>
                      <td className='px-4 py-2'>
                        <Link href={'/emergency/' + plan.id} className='text-primary font-medium hover:underline'>
                          {plan.title}
                        </Link>
                        {plan.summary ? <p className='text-textSecondary line-clamp-1 text-xs'>{plan.summary}</p> : null}
                      </td>
                      {archived ? <td className='px-4 py-2'>{PLAN_KINDS.find(item => item.key === plan.kind)?.label}</td> : null}
                      <td className='px-4 py-2'>{statusLabel(plan.kind, plan.status)}</td>
                      <td className='px-4 py-2'>{plan.locations?.name || 'Company-wide'}</td>
                      <td className='px-4 py-2'>
                        {plan.kind === 'drill' ? (
                          plan.event_date
                        ) : plan.review_due_on ? (
                          <span className={review === 'overdue' ? 'text-error font-semibold' : review === 'due_soon' ? 'text-warning font-semibold' : ''}>
                            {plan.review_due_on}
                            {review === 'overdue' ? ' (overdue)' : review === 'due_soon' ? ' (due soon)' : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>{archived ? 'Nothing is archived.' : `No ${kindInfo.plural.toLowerCase()} yet.`}</CardContent>
        </Card>
      )}
    </div>
  )
}

export default EmergencyPlansPage
