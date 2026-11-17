import Link from 'next/link'

import type { Metadata } from 'next'

import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import FormCatalogImportPanel from './FormCatalogImportPanel'

export const metadata: Metadata = { title: 'Import Forms from Forge 1.0' }

/** Port slice 9: imports the Forge 1.0 form catalog (templates and submissions) from a JSON export. */
const FormImportPage = async () => {
  await requireTenantPermission('forms.manage')

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h1 className='text-2xl font-semibold'>Import Forms from Forge 1.0</h1>
          <p className='text-textSecondary text-sm'>
            Bring over form templates and their submissions. Importing again is safe: forms already imported are updated only if nobody changed them here, and
            submissions already imported are skipped.
          </p>
        </div>
        <Link className='text-primary text-sm underline' href='/forms?view=manage'>
          Back to forms
        </Link>
      </div>
      <FormCatalogImportPanel />
    </div>
  )
}

export default FormImportPage
