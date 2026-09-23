import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Tenant | Forge Creator 2.0' }

const label = (value?: string | null) =>
  (value || 'unassigned').split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')

const TenantDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireForgePlatformRole()
  const { id } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: locations },
    { data: divisions },
    { data: memberships },
    { data: subscriptions },
    { data: roles },
    { data: overrides }
  ] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', id).maybeSingle(),
    supabase.from('locations').select('id, name, code, city, state_region, is_active').eq('organization_id', id).order('name'),
    supabase.from('divisions').select('id, name, code, is_active').eq('organization_id', id).order('name'),
    supabase.from('organization_memberships').select('user_id, role, is_active').eq('organization_id', id),
    supabase.from('forge_subscriptions').select('*, forge_plans(name)').eq('organization_id', id).order('created_at', { ascending: false }).limit(1),
    supabase.from('forge_tenant_roles').select('id, name, role_key, is_active').eq('organization_id', id).order('sort_order'),
    supabase.from('forge_tenant_entitlement_overrides').select('feature_id, enabled').eq('organization_id', id)
  ])

  if (!tenant) notFound()
  const subscription = subscriptions?.[0] || null

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0 / Tenant</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{tenant.name}</h1>
            <Badge size='sm' variant={tenant.status === 'active' ? 'tonalSuccess' : 'secondary'}>{label(tenant.status)}</Badge>
          </div>
          <p className='text-textSecondary mt-2'>{tenant.slug}</p>
        </div>
        <div className='flex gap-3'>
          <Button variant='outline' asChild><Link href='/admin/creator/tenants'>All Tenants</Link></Button>
          <Button variant='outline' asChild><Link href={`/admin/creator/tenants/${tenant.id}/experience`}>Experience Builder</Link></Button>
          <Button variant='outline' asChild><Link href={`/admin/creator/tenants/${tenant.id}/lookups`}>Dropdowns & Lookups</Link></Button>
          <Button variant='outline' asChild><Link href={`/admin/creator/tenants/${tenant.id}/features`}>Features & Entitlements</Link></Button>
          <Button variant='outline' asChild><Link href={`/admin/creator/tenants/${tenant.id}/access`}>Roles & Permissions</Link></Button>
          <Button asChild><Link href={`/admin/creator/tenants/${tenant.id}/edit`}>Edit Tenant</Link></Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Subscription</CardDescription></CardHeader>
          <CardContent>
            <div className='text-textPrimary text-xl font-semibold'>{subscription?.forge_plans?.name || 'Custom / unassigned'}</div>
            <div className='text-textSecondary text-sm'>{label(subscription?.status)}</div>
          </CardContent>
        </Card>
        <Card><CardHeader className='pb-2'><CardDescription>Locations</CardDescription></CardHeader><CardContent><div className='text-textPrimary text-2xl font-semibold'>{locations?.length || 0}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Members</CardDescription></CardHeader><CardContent><div className='text-textPrimary text-2xl font-semibold'>{memberships?.filter((item: any) => item.is_active).length || 0}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Entitlement overrides</CardDescription></CardHeader><CardContent><div className='text-textPrimary text-2xl font-semibold'>{overrides?.length || 0}</div></CardContent></Card>
      </div>

      <div className='grid gap-6 xl:grid-cols-2'>
        <Card>
          <CardHeader><CardTitle>Company profile</CardTitle><CardDescription>Forge-side tenant identity and contact details.</CardDescription></CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-2'>
            <div><div className='text-textSecondary text-xs'>Legal name</div><div>{tenant.legal_name || '—'}</div></div>
            <div><div className='text-textSecondary text-xs'>Customer number</div><div>{tenant.customer_number || '—'}</div></div>
            <div><div className='text-textSecondary text-xs'>Primary contact</div><div>{tenant.primary_contact_name || '—'}</div></div>
            <div><div className='text-textSecondary text-xs'>Primary email</div><div>{tenant.primary_contact_email || '—'}</div></div>
            <div><div className='text-textSecondary text-xs'>Billing email</div><div>{tenant.billing_contact_email || '—'}</div></div>
            <div><div className='text-textSecondary text-xs'>Phone</div><div>{tenant.phone || '—'}</div></div>
            <div><div className='text-textSecondary text-xs'>Time zone</div><div>{tenant.timezone}</div></div>
            <div><div className='text-textSecondary text-xs'>Locale</div><div>{tenant.locale}</div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Provisioned tenant roles</CardTitle><CardDescription>Permission details will be managed by the visual access builder.</CardDescription></CardHeader>
          <CardContent className='flex flex-wrap gap-2'>
            {(roles || []).map((role: any) => <Badge key={role.id} variant='outline' size='sm'>{role.name}</Badge>)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Locations</CardTitle><CardDescription>Current Location structure for this tenant.</CardDescription></CardHeader>
        <CardContent>
          {locations?.length ? (
            <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {locations.map((location: any) => (
                <div key={location.id} className='rounded-lg border p-4'>
                  <div className='text-textPrimary font-semibold'>{location.name}</div>
                  <div className='text-textSecondary text-sm'>{[location.city, location.state_region].filter(Boolean).join(', ') || 'No address entered'}</div>
                  <div className='text-textSecondary mt-1 text-xs'>{location.code || 'No code'}</div>
                </div>
              ))}
            </div>
          ) : <p className='text-textSecondary'>No Locations have been created yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Divisions</CardTitle><CardDescription>Company Divisions currently configured for this tenant.</CardDescription></CardHeader>
        <CardContent>
          {divisions?.length ? (
            <div className='flex flex-wrap gap-2'>{divisions.map((division: any) => <Badge key={division.id} variant='outline' size='sm'>{division.name}</Badge>)}</div>
          ) : <p className='text-textSecondary'>No Divisions have been created yet.</p>}
        </CardContent>
      </Card>

      {tenant.internal_notes ? (
        <Card>
          <CardHeader><CardTitle>Internal Forge notes</CardTitle></CardHeader>
          <CardContent className='whitespace-pre-wrap text-sm'>{tenant.internal_notes}</CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default TenantDetailPage
