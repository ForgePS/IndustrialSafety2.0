import type { Metadata } from 'next'

import FormBuilderImport from '@/components/forms/FormBuilderImport'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

import { loadBuilderOptions } from '../builderData'

export const metadata: Metadata = { title: 'Import Checklist' }

const ImportChecklistPage = async () => {
  const context = await requireTenantPermission('forms.manage')
  const { categories } = await loadBuilderOptions(context.activeOrganization.id)

  return <FormBuilderImport categories={categories} />
}

export default ImportChecklistPage
