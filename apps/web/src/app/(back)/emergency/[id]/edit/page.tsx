import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import PlanForm from '@/components/emergency/PlanForm'
import { companyLocations, grantOf, listPlans, loadPlan, scopeLocations } from '@/lib/forgeEmergency'
import { planKindLabel } from '@/lib/forgeEmergencyRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit emergency record' }

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/** Port slice 14: edit a plan, scenario, drill or team the person can manage. */
const EditEmergencyPlanPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('emergency_management.edit')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const plan = await loadPlan({ organizationId, userId, access: context.access, id })

  if (!plan || !plan.canEdit || plan.archived_at) notFound()

  const [locations, editLocations, plans] = await Promise.all([
    companyLocations(organizationId),
    scopeLocations(organizationId, userId, grantOf(context.access, 'emergency_management.edit')),
    listPlans({ organizationId, userId, access: context.access })
  ])

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href={'/emergency/' + plan.id} className='text-textSecondary text-sm hover:underline'>
          ← {plan.title}
        </Link>
        <h1 className='text-textPrimary mt-2 text-3xl font-bold'>Edit {planKindLabel(plan.kind).toLowerCase()}</h1>
      </div>
      <PlanForm
        kind={plan.kind}
        id={plan.id}
        initial={{
          title: str(plan.title),
          status: str(plan.status),
          scenarioType: str(plan.scenario_type),
          locationId: str(plan.location_id),
          planId: str(plan.plan_id),
          summary: str(plan.summary),
          body: str(plan.body),
          reviewDueOn: str(plan.review_due_on),
          eventDate: str(plan.event_date),
          participants: str(plan.participants),
          durationMinutes: str(plan.duration_minutes),
          afterAction: str(plan.after_action)
        }}
        locations={editLocations === null ? locations : locations.filter(location => editLocations.includes(location.id))}
        plans={plans.filter((item: any) => item.kind === 'plan' && item.id !== plan.id).map((item: any) => ({ id: item.id, title: item.title }))}
        companyWideAllowed={editLocations === null}
      />
    </div>
  )
}

export default EditEmergencyPlanPage
