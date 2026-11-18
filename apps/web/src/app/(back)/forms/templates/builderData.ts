import { createServiceRoleClient } from '@repo/supabase/server'

import type { FormBuilderInitial, FormBuilderOption } from '@/components/forms/FormBuilderTypes'
import { loadLatestTemplateVersion } from '@/lib/forgeFormAccess'
import { normalizeFormSchema } from '@/lib/forgeFormRules'

/** Port slice 9 (piece A): what the builder pages load (server only). */

export const loadBuilderOptions = async (organizationId: string) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: locations }, { data: divisions }, { data: categories }] = await Promise.all([
    supabase.from('locations').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('forge_form_templates').select('category').eq('organization_id', organizationId).not('category', 'is', null)
  ])

  return {
    locations: (locations || []) as FormBuilderOption[],
    divisions: (divisions || []) as FormBuilderOption[],
    categories: [...new Set(((categories || []) as { category: string }[]).map(row => row.category.trim()).filter(Boolean))].sort()
  }
}

export const loadBuilderTemplate = async (organizationId: string, id: string): Promise<FormBuilderInitial | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null

  const supabase = createServiceRoleClient() as any

  const { data: template } = await supabase.from('forge_form_templates').select('*').eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!template) return null

  const latest = await loadLatestTemplateVersion({ organizationId, templateId: id })
  const fields = normalizeFormSchema(template.schema).schema.fields

  const unpublishedChanges = latest
    ? JSON.stringify(latest.schema.fields) !== JSON.stringify(fields) || latest.title !== template.title
    : fields.length > 0

  return {
    id: template.id,
    title: template.title,
    description: template.description || '',
    category: template.category || '',
    locationId: template.location_id || '',
    divisionId: template.division_id || '',
    status: template.status,
    currentVersion: Number(template.current_version) || 0,
    publishedAt: latest?.published_at || null,
    unpublishedChanges,
    fields
  }
}
