import type { Metadata } from 'next'

import ManagedQrForm from '../ManagedQrForm'
import type { QrFormValues } from '../actions'
import { loadQrFormOptions } from '../qrFormOptions'
import { getScopedAssets } from '@/lib/forgeAssets'
import { getEffectiveForm } from '@/lib/forgeForms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Create Managed QR Code' }

const CreateQrCodePage = async ({
  searchParams
}: {
  searchParams: Promise<{ asset?: string; location?: string; form?: string; vehicle?: string; area?: string }>
}) => {
  const context = await requireTenantPermission('qr_management.create')
  const organizationId = context.activeOrganization.id
  const query = await searchParams

  const [form, assets, options] = await Promise.all([
    getEffectiveForm({ organizationId, formKey: 'qr.profile' }),
    getScopedAssets({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    loadQrFormOptions({ organizationId, userId: context.user.id, scope: context.permission.scope })
  ])

  if (!form) return <div className='rounded-lg border p-6'>Managed QR Code form is not configured.</div>

  const selectedAsset = query.asset && assets.some((asset: any) => asset.id === query.asset)
    ? query.asset
    : ''

  const selectedLocation = query.location && options.locations.some(item => item.id === query.location) ? query.location : ''
  const selectedForm = query.form && options.forms.some(item => item.id === query.form) ? query.form : ''
  const selectedVehicle = query.vehicle && options.vehicles.some(item => item.id === query.vehicle) ? query.vehicle : ''
  const selectedArea = query.area ? options.areas.find(item => item.id === query.area) : undefined

  const initialValues: QrFormValues = {
    asset_id: selectedAsset,
    default_action: 'scan_menu',
    status: 'active',
    ...(selectedArea ? { name: 'Area Card · ' + selectedArea.label.split(' · ')[0] } : {})
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
        initialSettings={{
          targetType: selectedArea ? 'area' : selectedVehicle ? 'vehicle' : selectedLocation ? 'location' : selectedForm ? 'form' : 'asset',
          targetId: selectedArea?.id || selectedVehicle || selectedLocation || selectedForm || selectedAsset,

          // An Area Card hangs at the entrance for anyone walking in, so default to employee-number access.
          accessMode: selectedArea ? 'employee_number' : 'signed_in',
          actionConfig: {}
        }}
        assets={assets.map((asset: any) => ({
          id: asset.id,
          label: asset.asset_number + ' · ' + asset.name
        }))}
        locations={options.locations}
        vehicles={options.vehicles}
        areas={options.areas}
        forms={options.forms}
        inspectionTemplates={options.inspectionTemplates}
      />
    </div>
  )
}

export default CreateQrCodePage
