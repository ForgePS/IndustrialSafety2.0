import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import TenantForm from '../../TenantForm'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Edit Tenant | Forge Creator 2.0' }

const EditTenantPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const { id } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: plans },
    { data: subscriptions }
  ] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', id).maybeSingle(),
    supabase.from('forge_plans').select('id, name, status, billing_interval, base_price_cents').eq('status', 'active').order('name'),
    supabase.from('forge_subscriptions').select('plan_id, status, created_at').eq('organization_id', id).order('created_at', { ascending: false }).limit(1)
  ])

  if (!tenant) notFound()
  const subscription = subscriptions?.[0] || null

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Edit {tenant.name}</h1>
        <p className='text-textSecondary mt-2'>Update the Forge-side tenant profile and current subscription state.</p>
      </div>
      <TenantForm
        plans={plans || []}
        initial={{
          ...tenant,
          plan_id: subscription?.plan_id ?? null,
          subscription_status: subscription?.status ?? null
        }}
      />
    </div>
  )
}

export default EditTenantPage
