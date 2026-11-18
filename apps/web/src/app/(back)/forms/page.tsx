import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'

import FormBuilderLibrary from '@/components/forms/FormBuilderLibrary'
import type { LibraryTemplate } from '@/lib/forgeFormBuilderRules'
import { countAnswerFields } from '@/lib/forgeFormBuilderRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forms' }

/**
 * Port slice 9 (piece A): the form library (1.0 forms-workspace library tab). Everyone with forms.view sees the
 * active (published) forms; with forms.manage, ?view=manage lists drafts and archived forms too.
 */
const FormsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('forms.view')
  const organizationId = context.activeOrganization.id
  const params = await searchParams
  const allowed = (key: string) => context.access.effective.some(item => item.permissionKey === key && item.allowed)
  const canManage = allowed('forms.manage')
  const canSubmit = allowed('forms.submit')
  const manage = canManage && params.view === 'manage'
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_form_templates')
    .select('id, title, description, category, status, current_version, schema, updated_at')
    .eq('organization_id', organizationId)
    .order('title')

  if (!manage) query = query.eq('status', 'active')

  const { data: templates } = await query
  const rows = (templates || []) as any[]
  const published = rows.filter(row => Number(row.current_version) > 0)
  const versions = new Map<string, { published_at: string; schema: any }>()

  // The version people fill is the current one; read only those rows.
  for (let index = 0; index < published.length; index += 100) {
    const chunk = published.slice(index, index + 100)

    const { data } = await supabase
      .from('forge_form_template_versions')
      .select('template_id, version, published_at, schema')
      .eq('organization_id', organizationId)
      .or(chunk.map(row => `and(template_id.eq.${row.id},version.eq.${Number(row.current_version)})`).join(','))

    for (const version of (data || []) as any[]) versions.set(version.template_id, version)
  }

  const library: LibraryTemplate[] = rows.map(row => {
    const version = versions.get(row.id)

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      status: row.status,
      version: Number(row.current_version) || 0,
      fieldCount: countAnswerFields((manage && row.status !== 'active') || !version ? row.schema?.fields : version.schema?.fields),
      publishedAt: version?.published_at || null,
      updatedAt: row.updated_at
    }
  })

  return <FormBuilderLibrary templates={library} manage={manage} canManage={canManage} canSubmit={canSubmit} />
}

export default FormsPage
