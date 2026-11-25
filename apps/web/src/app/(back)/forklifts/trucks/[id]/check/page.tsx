import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServiceRoleClient } from '@repo/supabase/server'

import CheckForm from '@/components/forklifts/CheckForm'
import { companyPersonnel, forkliftRights, loadCheckItems, loadForkliftSettings, loadTruck, operatorProblem, personnelForUser, rightsAt } from '@/lib/forgeForkliftAccess'
import { applicableItems, truckSummary } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Pre-shift check' }

/** Port slice 19: the pre-shift check for one forklift (1910.178(q)(7)). Problems are shown before it is filled in. */
const CheckPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const rights = await forkliftRights(organizationId, userId, context.access)
  const truck = await loadTruck(organizationId, rights, id)

  if (!truck) notFound()
  const here = rightsAt(rights, truck.asset.location_id)

  if (!here.check) redirect('/forklifts/trucks/' + truck.id)

  const [items, settings, own, people, meter] = await Promise.all([
    loadCheckItems(organizationId),
    loadForkliftSettings(organizationId),
    personnelForUser(organizationId, userId),
    here.manage ? companyPersonnel(organizationId) : Promise.resolve([]),
    (createServiceRoleClient() as any)
      .from('forge_asset_meter_readings')
      .select('reading')
      .eq('organization_id', organizationId)
      .eq('asset_id', truck.asset_id)
      .eq('meter_type', 'hours')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ])

  const outOfService = truck.asset.status === 'out_of_service'
  const retired = Boolean(truck.asset.retired_at) || truck.asset.status === 'retired'
  const problem = own && settings.require_authorized_operator ? await operatorProblem(organizationId, own.id, truck.truck_class) : null
  const checklist = applicableItems(items, truck.power_source)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href={'/forklifts/trucks/' + truck.id} className='text-primary text-sm hover:underline'>
          ← {truck.asset.name}
        </Link>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Pre-shift check: {truck.asset.name}</h1>
        <p className='text-textSecondary mt-2'>
          {truck.asset.asset_number} · {truckSummary(truck)}
        </p>
      </div>
      {outOfService || retired ? (
        <div className='border-error bg-error/10 text-error rounded-md border-2 p-4' data-check-blocked>
          <p className='text-lg font-bold'>{retired ? 'This forklift is retired.' : 'OUT OF SERVICE. Do not use this forklift.'}</p>
          <p className='mt-1 text-sm'>A pre-shift check can be done once it is returned to service.</p>
        </div>
      ) : (
        <CheckForm
          forkliftId={truck.id}
          items={checklist}
          canPick={here.manage}
          own={own ? { id: own.id, name: own.name } : null}
          operators={people.map(person => ({ id: person.id, name: person.name + (person.employeeNumber ? ` (${person.employeeNumber})` : '') }))}
          initialProblem={problem}
          criticalOutOfService={settings.critical_defect_out_of_service}
          lastHours={meter.data ? Number(meter.data.reading) : null}
        />
      )}
    </div>
  )
}

export default CheckPage
