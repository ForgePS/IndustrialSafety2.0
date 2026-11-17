import type { Metadata } from 'next'

import FormBuilder from '@/components/forms/FormBuilder'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

import { loadBuilderOptions } from '../builderData'

export const metadata: Metadata = { title: 'New Form' }

const NewFormTemplatePage = async () => {
  const context = await requireTenantPermission('forms.manage')
  const options = await loadBuilderOptions(context.activeOrganization.id)

  return (
    <FormBuilder
      initial={{
        id: null,
        title: '',
        description: '',
        category: '',
        locationId: '',
        divisionId: '',
        status: 'draft',
        currentVersion: 0,
        publishedAt: null,
        unpublishedChanges: false,
        fields: []
      }}
      {...options}
    />
  )
}

export default NewFormTemplatePage
