import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import FormBuilder from '@/components/forms/FormBuilder'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

import { loadBuilderOptions, loadBuilderTemplate } from '../builderData'

export const metadata: Metadata = { title: 'Edit Form' }

const EditFormTemplatePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('forms.manage')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const [template, options] = await Promise.all([loadBuilderTemplate(organizationId, id), loadBuilderOptions(organizationId)])

  if (!template) notFound()

  return <FormBuilder key={template.id} initial={template} {...options} />
}

export default EditFormTemplatePage
