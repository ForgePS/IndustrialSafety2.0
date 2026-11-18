import type { Metadata } from 'next'
import ManagedQrForm from '../ManagedQrForm'
import type { QrFormValues } from '../actions'
import { getScopedAssets } from '@/lib/forgeAssets'
import { getEffectiveForm } from '@/lib/forgeForms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Create Managed QR Code' }

const CreateQrCodePage = async ({
  searchParams
}: {
  searchParams: Promise<{ asset?: string }>
}) => {
  const context = await requireTenantPermission('qr_management.create')
  const organizationId = context.activeOrganization.id
  const query = await searchParams

  const [form, assets] = await Promise.all([
    getEffectiveForm({ organizationId, formKey: 'qr.profile' }),
    getScopedAssets({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    })
  ])

  if (!form) return <div className='rounded-lg border p-6'>Managed QR Code form is not configured.</div>

  const selectedAsset = query.asset && assets.some((asset: any) => asset.id === query.asset)
    ? query.asset
    : ''

  const initialValues: QrFormValues = {
    asset_id: selectedAsset,
    default_action: 'asset_record',
    status: 'active'
  }

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / QR Management</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{form.name}</h1>
        <p className='text-textSecondary mt-2'>{form.description}</p>
      </div>

      <ManagedQrForm
        form={form}
        initialValues={initialValues}
        assets={assets.map((asset: any) => ({
          id: asset.id,
          label: asset.asset_number + ' · ' + asset.name
        }))}
      />
    </div>
  )
}

export default CreateQrCodePage
