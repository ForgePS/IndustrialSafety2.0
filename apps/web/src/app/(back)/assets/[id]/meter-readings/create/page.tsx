import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import AssetServiceForm from '../../../AssetServiceForm'
import { assetWithinScope } from '@/lib/forgeAssets'
import { getEffectiveForm } from '@/lib/forgeForms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Add Meter Reading' }

const AddAssetMeterReadingPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('assets_equipment.meter')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: asset }, form] = await Promise.all([
    supabase.from('forge_assets').select('*').eq('organization_id', organizationId).eq('id', id).maybeSingle(),
    getEffectiveForm({ organizationId, formKey: 'assets.meter_reading' })
  ])

  if (!asset || !form) notFound()

  const allowed = await assetWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    asset
  })

  if (!allowed) notFound()

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Assets & Equipment</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{form.name}</h1>
        <p className='text-textSecondary mt-2'>{asset.asset_number} · {asset.name}</p>
      </div>

      <AssetServiceForm assetId={asset.id} form={form} mode='meter' />
    </div>
  )
}

export default AddAssetMeterReadingPage
