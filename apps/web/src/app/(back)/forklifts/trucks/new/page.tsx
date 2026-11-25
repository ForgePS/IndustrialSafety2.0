import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import TruckForm from '@/components/forklifts/TruckForm'
import { assetsWithoutProfile, companyLocations, covers, forkliftRights } from '@/lib/forgeForkliftAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Add a forklift' }

const EMPTY = {
  asset_id: '',
  name: '',
  location_id: '',
  manufacturer: '',
  model: '',
  serial_number: '',
  truck_class: '',
  truck_type: '',
  power_source: '',
  rated_capacity_lb: '',
  load_center_in: '24',
  max_lift_height_in: '',
  attachments: '',
  designation: '',
  nameplate_verified_on: '',
  notes: ''
}

/** Port slice 19: add a forklift as new equipment, or set up equipment already in the register as a forklift. */
const NewTruckPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)

  if (!rights.manage) redirect('/forklifts/trucks')

  const existing = (await searchParams).existing === '1'
  const [locations, assets] = await Promise.all([companyLocations(organizationId), existing ? assetsWithoutProfile(organizationId, rights.manage) : Promise.resolve([])])
  const allowed = locations.filter(location => covers(rights.manage, location.id))
  const tab = (active: boolean) => '-mb-px border-b-2 px-3 py-2 text-sm font-medium ' + (active ? 'border-primary text-primary' : 'text-textSecondary hover:text-textPrimary border-transparent')

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/forklifts/trucks' className='text-primary text-sm hover:underline'>
          ← Trucks
        </Link>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Add a forklift</h1>
      </div>
      <nav className='flex gap-1 border-b' aria-label='How to add'>
        <Link href='/forklifts/trucks/new' className={tab(!existing)} aria-current={!existing ? 'page' : undefined}>
          New equipment
        </Link>
        <Link href='/forklifts/trucks/new?existing=1' className={tab(existing)} aria-current={existing ? 'page' : undefined} data-existing-equipment>
          Set up existing equipment as a forklift
        </Link>
      </nav>
      <TruckForm
        key={existing ? 'existing' : 'new'}
        mode={existing ? 'existing' : 'new'}
        locations={allowed}
        assets={assets.map(asset => ({ id: asset.id, name: asset.name }))}
        initial={{ ...EMPTY, location_id: allowed.length === 1 ? allowed[0].id : '' }}
      />
    </div>
  )
}

export default NewTruckPage
