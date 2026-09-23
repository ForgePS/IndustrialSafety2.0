import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import TenantExperienceBuilder from './TenantExperienceBuilder'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Tenant Experience Builder | Forge Creator 2.0' }

const TenantExperiencePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireForgePlatformRole()
  const { id } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: elements },
    { data: overrides }
  ] = await Promise.all([
    supabase.from('organizations').select('id, name, slug').eq('id', id).maybeSingle(),
    supabase.from('forge_experience_elements').select('*').eq('platform_enabled', true).order('category').order('sort_order'),
    supabase.from('forge_tenant_experience_overrides').select('*').eq('organization_id', id)
  ])

  if (!tenant) notFound()

  const overrideByElement = new Map((overrides || []).map((item: any) => [item.element_id, item]))
  const hydrated = (elements || []).map((element: any) => ({
    ...element,
    override: overrideByElement.get(element.id) || null
  }))

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0 / {tenant.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Experience Builder</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Edit how Forge looks and behaves for this tenant, and decide exactly what their admins and users are allowed to customize.
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' asChild><Link href={`/admin/creator/tenants/${id}`}>Back to Tenant</Link></Button>
        </div>
      </div>

      <TenantExperienceBuilder organizationId={id} elements={hydrated} />
    </div>
  )
}

export default TenantExperiencePage
