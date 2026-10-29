import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import TemplateManager from './TemplateManager'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Inspection Templates' }

const InspectionTemplatesPage = async () => {
  const context = await requireTenantPermission('inspections.manage_templates')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: templates }, { data: items }, typeLookup] = await Promise.all([
    supabase
      .from('forge_inspection_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase
      .from('forge_inspection_template_items')
      .select('*')
      .eq('organization_id', organizationId)
      .order('sort_order'),
    getEffectiveLookup({ organizationId, lookupKey: 'inspections.type' })
  ])

  const itemsByTemplate = new Map<string, any[]>()
  for (const item of items || []) {
    if (!itemsByTemplate.has(item.template_id)) itemsByTemplate.set(item.template_id, [])
    itemsByTemplate.get(item.template_id)?.push(item)
  }

  const hydrated = (templates || []).map((template: any) => ({
    ...template,
    items: itemsByTemplate.get(template.id) || []
  }))

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Inspections</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Inspection Templates</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Build the tenant's inspection checklists. New inspections take a snapshot so later template changes do not rewrite historical records.
          </p>
        </div>
        <Button variant='outline' asChild><Link href='/inspections'>Back to Inspections</Link></Button>
      </div>

      <TemplateManager
        templates={hydrated}
        typeOptions={typeLookup.options.map(option => ({ key: option.key, label: option.label }))}
      />
    </div>
  )
}

export default InspectionTemplatesPage
