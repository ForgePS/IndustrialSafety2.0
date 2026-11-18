import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import Tenants from './Tenants'
import type { TenantListItem } from './Tenants'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Tenants | Forge Creator 2.0' }

const TenantsPage = async () => {
  await requireForgePlatformRole()
  const supabase = createServiceRoleClient() as any

  const [
    { data: organizations, error: organizationsError },
    { data: locations },
    { data: memberships },
    { data: subscriptions },
    { data: plans }
  ] = await Promise.all([
    supabase.from('organizations').select('*').order('name'),
    supabase.from('locations').select('organization_id'),
    supabase.from('organization_memberships').select('organization_id').eq('is_active', true),
    supabase.from('forge_subscriptions').select('organization_id, plan_id, status, created_at').order('created_at', { ascending: false }),
    supabase.from('forge_plans').select('id, name')
  ])

  if (organizationsError) throw new Error(`Unable to load tenants: ${organizationsError.message}`)

  const locationCounts = new Map<string, number>()
  const memberCounts = new Map<string, number>()
  const planNames = new Map((plans || []).map((plan: any) => [plan.id, plan.name]))
  const latestSubscriptions = new Map<string, any>()

  for (const location of locations || []) locationCounts.set(location.organization_id, (locationCounts.get(location.organization_id) || 0) + 1)
  for (const membership of memberships || []) memberCounts.set(membership.organization_id, (memberCounts.get(membership.organization_id) || 0) + 1)
  for (const subscription of subscriptions || []) {
    if (!latestSubscriptions.has(subscription.organization_id)) latestSubscriptions.set(subscription.organization_id, subscription)
  }

  const tenants: TenantListItem[] = (organizations || []).map((organization: any) => {
    const subscription = latestSubscriptions.get(organization.id)
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      primary_contact_email: organization.primary_contact_email,
      locationCount: locationCounts.get(organization.id) || 0,
      memberCount: memberCounts.get(organization.id) || 0,
      planName: subscription?.plan_id ? planNames.get(subscription.plan_id) || null : null,
      subscriptionStatus: subscription?.status || null
    }
  })

  return <Tenants tenants={tenants} />
}

export default TenantsPage
