import type { Metadata } from 'next'
import LotoRecordForm from '../LotoRecordForm'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getScopedLotoAssets } from '@/lib/forgeLoto'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Create LOTO Procedure' }

const CreateLotoProcedurePage = async ({
  searchParams
}: {
  searchParams: Promise<{ asset?: string }>
}) => {
  const context = await requireTenantPermission('loto.create')
  const organizationId = context.activeOrganization.id
  const query = await searchParams

  const [form, assets] = await Promise.all([
    getEffectiveForm({ organizationId, formKey: 'loto.procedure' }),
    getScopedLotoAssets({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    })
  ])

  if (!form) {
    return <div className='rounded-lg border p-6'>LOTO Procedure form is not configured.</div>
  }

  const selectedAsset =
    query.asset && assets.some((asset: any) => asset.id === query.asset)
      ? query.asset
      : ''

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Lockout / Tagout</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{form.name}</h1>
        <p className='text-textSecondary mt-2'>{form.description}</p>
      </div>

      <LotoRecordForm
        form={form}
        initialValues={{ asset_id: selectedAsset }}
        assets={assets.map((asset: any) => ({
          id: asset.id,
          label: asset.asset_number + ' · ' + asset.name
        }))}
      />
    </div>
  )
}

export default CreateLotoProcedurePage
