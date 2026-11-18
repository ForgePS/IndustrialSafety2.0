import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import TenantFormBuilder from './TenantFormBuilder'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Forms & Fields | Forge Creator 2.0' }

const TenantFormsPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireForgePlatformRole()
  const { id } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: forms },
    { data: fields },
    { data: formOverrides },
    { data: fieldOverrides },
    { data: lookups }
  ] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('forge_form_definitions').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('forge_form_fields').select('*').order('section_key').order('sort_order'),
    supabase.from('forge_tenant_form_overrides').select('*').eq('organization_id', id),
    supabase.from('forge_tenant_form_field_overrides').select('*').eq('organization_id', id),
    supabase.from('forge_lookup_definitions').select('id, lookup_key, name').eq('is_active', true).order('name')
  ])

  if (!tenant) notFound()

  const fieldsByForm = new Map<string, any[]>()
  const formOverrideById = new Map((formOverrides || []).map((item: any) => [item.form_id, item]))
  const fieldOverrideById = new Map((fieldOverrides || []).map((item: any) => [item.field_id, item]))

  for (const field of fields || []) {
    if (!fieldsByForm.has(field.form_id)) fieldsByForm.set(field.form_id, [])
    fieldsByForm.get(field.form_id)?.push({
      ...field,
      override: fieldOverrideById.get(field.id) || null
    })
  }

  const hydrated = (forms || []).map((form: any) => ({
    ...form,
    override: formOverrideById.get(form.id) || null,
    fields: fieldsByForm.get(form.id) || []
  }))

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0 / {tenant.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Forms & Fields</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Configure form labels, field behavior, order, visibility, required rules, dropdown sources and tenant editing rights.
          </p>
        </div>
        <Button variant='outline' asChild><Link href={`/admin/creator/tenants/${id}`}>Back to Tenant</Link></Button>
      </div>

      <TenantFormBuilder organizationId={id} forms={hydrated} lookups={lookups || []} />
    </div>
  )
}

export default TenantFormsPage
