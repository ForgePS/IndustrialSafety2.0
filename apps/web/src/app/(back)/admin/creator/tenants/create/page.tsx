import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import TenantForm from '../TenantForm'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Create Tenant | Forge Creator 2.0' }

const CreateTenantPage = async () => {
  await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const supabase = createServiceRoleClient() as any
  const { data: plans } = await supabase
    .from('forge_plans')
    .select('id, name, status, billing_interval, base_price_cents')
    .eq('status', 'active')
    .order('name')

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Create Tenant</h1>
        <p className='text-textSecondary mt-2'>Provision a company with a clean tenant boundary, default roles and subscription state.</p>
      </div>
      <TenantForm plans={plans || []} />
    </div>
  )
}

export default CreateTenantPage
