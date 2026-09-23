import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import CompanyFormDesigner from './CompanyFormDesigner'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Form Designer' }

const CompanyFormsPage = async () => {
  const context = await requireTenantPermission('tenant.forms.view')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: forms },
    { data: fields },
    { data: formOverrides },
    { data: fieldOverrides },
    { data: lookups }
  ] = await Promise.all([
    supabase.from('forge_form_definitions').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('forge_form_fields').select('*').order('section_key').order('sort_order'),
    supabase.from('forge_tenant_form_overrides').select('*').eq('organization_id', organizationId),
    supabase.from('forge_tenant_form_field_overrides').select('*').eq('organization_id', organizationId),
    supabase.from('forge_lookup_definitions').select('id, name').eq('is_active', true).order('name')
  ])

  const formOverrideById = new Map((formOverrides || []).map((item: any) => [item.form_id, item]))
  const fieldOverrideById = new Map((fieldOverrides || []).map((item: any) => [item.field_id, item]))
  const fieldsByForm = new Map<string, any[]>()

  for (const field of fields || []) {
    if (!fieldsByForm.has(field.form_id)) fieldsByForm.set(field.form_id, [])
    fieldsByForm.get(field.form_id)?.push({
      ...field,
      override: fieldOverrideById.get(field.id) || null
    })
  }

  const hydrated = (forms || [])
    .map((form: any) => {
      const override = formOverrideById.get(form.id) || null
      const editMode = override?.tenant_edit_mode_override ?? form.tenant_edit_mode

      return {
        ...form,
        override,
        editMode,
        canHideFields: override?.tenant_can_hide_fields_override ?? form.tenant_can_hide_fields,
        canReorderFields: override?.tenant_can_reorder_fields_override ?? form.tenant_can_reorder_fields,
        canChangeRequired: override?.tenant_can_change_required_override ?? form.tenant_can_change_required,
        canChangeInputType: override?.tenant_can_change_input_type_override ?? form.tenant_can_change_input_type,
        canChangeLookup: override?.tenant_can_change_lookup_override ?? form.tenant_can_change_lookup,
        fields: fieldsByForm.get(form.id) || []
      }
    })
    .filter((form: any) => form.editMode !== 'none')

  const canManage = context.access.effective.some(
    item => item.permissionKey === 'tenant.forms.manage' && item.allowed
  )

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name}</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Form Designer</h1>
        <p className='text-textSecondary mt-2 max-w-4xl'>
          Customize the forms Forge Creator has opened for your company. Locked data rules remain protected automatically.
        </p>
      </div>

      <CompanyFormDesigner forms={hydrated} lookups={lookups || []} canManage={canManage} />
    </div>
  )
}

export default CompanyFormsPage
