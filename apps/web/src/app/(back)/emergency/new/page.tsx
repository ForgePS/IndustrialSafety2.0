import type { Metadata } from 'next'
import Link from 'next/link'

import PlanForm from '@/components/emergency/PlanForm'
import { companyLocations, grantOf, listPlans, scopeLocations } from '@/lib/forgeEmergency'
import { PLAN_KINDS, isPlanKind } from '@/lib/forgeEmergencyRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'New emergency record' }

/** Port slice 14: a new action plan, scenario, drill or response team. */
const NewEmergencyPlanPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('emergency_management.edit')
  const query = await searchParams
  const kind = isPlanKind(query.kind) ? query.kind : 'plan'
  const organizationId = context.activeOrganization.id
  const userId = context.user.id

  const [locations, editLocations, plans] = await Promise.all([
    companyLocations(organizationId),
    scopeLocations(organizationId, userId, grantOf(context.access, 'emergency_management.edit')),
    listPlans({ organizationId, userId, access: context.access })
  ])

  const label = PLAN_KINDS.find(item => item.key === kind)!.label

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href={'/emergency?kind=' + kind} className='text-textSecondary text-sm hover:underline'>
          ← Emergency plans
        </Link>
        <h1 className='text-textPrimary mt-2 text-3xl font-bold'>New {label.toLowerCase()}</h1>
      </div>
      <PlanForm
        kind={kind}
        initial={{ eventDate: kind === 'drill' ? new Date().toISOString().slice(0, 10) : '' }}
        locations={editLocations === null ? locations : locations.filter(location => editLocations.includes(location.id))}
        plans={plans.filter((plan: any) => plan.kind === 'plan').map((plan: any) => ({ id: plan.id, title: plan.title }))}
        companyWideAllowed={editLocations === null}
      />
    </div>
  )
}

export default NewEmergencyPlanPage
