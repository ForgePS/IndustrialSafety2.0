import { notFound } from 'next/navigation'

import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'

import FormPrintSheet from '@/components/forms/FormPrintSheet'
import { loadLatestTemplateVersion } from '@/lib/forgeFormAccess'
import { normalizeFormSchema } from '@/lib/forgeFormRules'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getTenantContext } from '@/lib/forgeTenantContext'

export const metadata: Metadata = { title: 'Print Form' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Port slice 9: a blank paper copy of a form (1.0 GET /industrial/forms/:id/printable). Needs forms.export or
 * forms.manage. Prints the latest published version; a never-published draft prints its working copy for
 * forms.manage only.
 */
const BlankFormPrintPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) notFound()

  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })
  const allowed = (key: string) => access.effective.some(item => item.permissionKey === key && item.allowed)
  const canManage = allowed('forms.manage')

  if (!canManage && !allowed('forms.export')) notFound()

  const { id } = await params

  if (!UUID.test(id)) notFound()

  const supabase = createServiceRoleClient() as any

  const { data: template } = await supabase
    .from('forge_form_templates')
    .select('id, title, description, schema, current_version, status')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()

  if (!template) notFound()

  const latest = await loadLatestTemplateVersion({ organizationId, templateId: id })

  if (!latest && !canManage) notFound()

  const fields = latest ? latest.schema.fields : normalizeFormSchema(template.schema).schema.fields
  const title = latest?.title || template.title

  return (
    <FormPrintSheet
      mode='blank'
      companyName={context.activeOrganization.name}
      title={title}
      subtitle={latest ? `Version ${latest.version}` : 'Draft (not published)'}
      fields={fields}
      meta={template.description ? [{ label: 'About this form', value: template.description }] : []}
      footer={`${context.activeOrganization.name} · ${title}${latest ? ` · v${latest.version}` : ''}`}
      backHref={canManage ? `/forms/templates/${id}` : '/forms'}
      backLabel={canManage ? 'Back to form' : 'Back to forms'}
    />
  )
}

export default BlankFormPrintPage
