import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'
import AssetRecordForm from '../AssetRecordForm'
import AssetRetireCard from '../AssetRetireCard'
import type { AssetFormValues } from '../actions'
import { assetWithinScope, getAssetDetailData } from '@/lib/forgeAssets'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import ForgeAiContextButton from '@/components/forge-ai/ForgeAiContextButton'

export const metadata: Metadata = { title: 'Asset & Equipment' }

const AssetDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('assets_equipment.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: asset },
    form,
    detail,
    typeLookup,
    statusLookup,
    conditionLookup,
    criticalityLookup,
    maintenanceTypeLookup,
    maintenanceStatusLookup,
    meterTypeLookup,
    { data: locations },
    { data: divisions }
  ] = await Promise.all([
    supabase
      .from('forge_assets')
      .select('*, locations(name, code), divisions(name, code), forge_personnel!forge_assets_custodian_personnel_id_fkey(first_name, last_name, employee_number)')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle(),
    getEffectiveForm({ organizationId, formKey: 'assets.profile' }),
    getAssetDetailData({ organizationId, assetId: id }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.condition' }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.criticality' }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.maintenance_type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.maintenance_status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.meter_type' }),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name')
  ])

  if (!asset || !form) notFound()

  const mayView = await assetWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    asset
  })
  if (!mayView) notFound()

  const permissions = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissions.get('assets_equipment.edit')
  const assignPermission = permissions.get('assets_equipment.assign')
  const maintenancePermission = permissions.get('assets_equipment.maintenance')
  const meterPermission = permissions.get('assets_equipment.meter')
  const retirePermission = permissions.get('assets_equipment.retire')
  const qrCreatePermission = permissions.get('qr_management.create')
  const lotoCreatePermission = permissions.get('loto.create')
  const canUseAi = Boolean(permissions.get('forge_ai.use'))

  const within = async (permission: any) =>
    permission
      ? assetWithinScope({
          organizationId,
          userId: context.user.id,
          scope: permission.scope,
          asset
        })
      : false

  const [canEdit, canAssign, canMaintain, canMeter, canRetire, canCreateQr, canCreateLoto, personnel] = await Promise.all([
    within(editPermission),
    within(assignPermission),
    within(maintenancePermission),
    within(meterPermission),
    within(retirePermission),
    within(qrCreatePermission),
    within(lotoCreatePermission),
    assignPermission || editPermission
      ? getScopedPersonnel({
          organizationId,
          userId: context.user.id,
          permission: (assignPermission || editPermission) as any
        })
      : Promise.resolve([])
  ])

  const typeLabels = Object.fromEntries(typeLookup.options.map(option => [option.key, option.label]))
  const statusLabels = Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))
  const conditionLabels = Object.fromEntries(conditionLookup.options.map(option => [option.key, option.label]))
  const criticalityLabels = Object.fromEntries(criticalityLookup.options.map(option => [option.key, option.label]))
  const maintenanceTypeLabels = Object.fromEntries(maintenanceTypeLookup.options.map(option => [option.key, option.label]))
  const maintenanceStatusLabels = Object.fromEntries(maintenanceStatusLookup.options.map(option => [option.key, option.label]))
  const meterTypeLabels = Object.fromEntries(meterTypeLookup.options.map(option => [option.key, option.label]))

  const values: AssetFormValues = {
    name: asset.name,
    asset_type: asset.asset_type,
    status: asset.status,
    condition: asset.condition,
    criticality: asset.criticality,
    description: asset.description || '',
    manufacturer: asset.manufacturer || '',
    model: asset.model || '',
    serial_number: asset.serial_number || '',
    barcode: asset.barcode || '',
    location_id: asset.location_id || '',
    division_id: asset.division_id || '',
    custodian_personnel_id: asset.custodian_personnel_id || '',
    purchase_date: asset.purchase_date || '',
    in_service_date: asset.in_service_date || '',
    warranty_expires_on: asset.warranty_expires_on || '',
    purchase_cost: asset.purchase_cost == null ? '' : String(asset.purchase_cost),
    replacement_cost: asset.replacement_cost == null ? '' : String(asset.replacement_cost)
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Assets & Equipment</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{asset.name}</h1>
            <Badge size='sm' variant={asset.status === 'active' ? 'tonalSuccess' : asset.status === 'out_of_service' ? 'destructive' : 'secondary'}>
              {statusLabels[asset.status] || asset.status}
            </Badge>
            <Badge size='sm' variant='outline'>{typeLabels[asset.asset_type] || asset.asset_type}</Badge>
          </div>
          <p className='text-textSecondary mt-2'>{asset.asset_number}{asset.serial_number ? ' · Serial ' + asset.serial_number : ''}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canUseAi ? <ForgeAiContextButton contextType='asset' recordId={asset.id} recordLabel={asset.asset_number} /> : null}
          {canCreateLoto && !asset.retired_at ? <Button variant='outline' asChild><Link href={'/loto/create?asset=' + asset.id}>Create LOTO</Link></Button> : null}
          {canCreateQr && !asset.retired_at ? <Button variant='outline' asChild><Link href={'/qr/create?asset=' + asset.id}>Create QR</Link></Button> : null}
          {canMaintain && !asset.retired_at ? <Button variant='outline' asChild><Link href={'/assets/' + asset.id + '/maintenance/create'}>Add Maintenance</Link></Button> : null}
          {canMeter && !asset.retired_at ? <Button variant='outline' asChild><Link href={'/assets/' + asset.id + '/meter-readings/create'}>Add Meter Reading</Link></Button> : null}
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card><CardHeader className='pb-2'><CardDescription>Condition</CardDescription></CardHeader><CardContent><div className='font-semibold'>{conditionLabels[asset.condition] || asset.condition}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Criticality</CardDescription></CardHeader><CardContent><div className='font-semibold'>{criticalityLabels[asset.criticality] || asset.criticality}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Location</CardDescription></CardHeader><CardContent><div className='font-semibold'>{asset.locations?.name || '—'}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Custodian</CardDescription></CardHeader><CardContent><div className='font-semibold'>{asset.forge_personnel ? asset.forge_personnel.first_name + ' ' + asset.forge_personnel.last_name : '—'}</div></CardContent></Card>
      </div>

      {asset.retired_at ? (
        <Card>
          <CardHeader>
            <CardTitle>Retired Asset</CardTitle>
            <CardDescription>{new Date(asset.retired_at).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent>{asset.retirement_reason || 'No retirement reason recorded.'}</CardContent>
        </Card>
      ) : null}

      <AssetRecordForm
        form={form}
        assetId={asset.id}
        initialValues={values}
        readOnly={!canEdit || Boolean(asset.retired_at)}
        canAssign={Boolean(canAssign)}
        locations={(locations || []).map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
        divisions={(divisions || []).map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
        personnel={(personnel || []).map((person: any) => ({
          id: person.id,
          label: person.employee_number
            ? person.first_name + ' ' + person.last_name + ' (' + person.employee_number + ')'
            : person.first_name + ' ' + person.last_name
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Maintenance History</CardTitle>
          <CardDescription>Repairs, inspections, calibration, certifications, and scheduled service.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Work Order</TableHead>
              <TableHead className='text-right'>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.maintenance.length ? detail.maintenance.map((record: any) => (
              <TableRow key={record.id}>
                <TableCell>{record.performed_on || record.scheduled_for || '—'}</TableCell>
                <TableCell>{maintenanceTypeLabels[record.maintenance_type] || record.maintenance_type}</TableCell>
                <TableCell>{maintenanceStatusLabels[record.status] || record.status}</TableCell>
                <TableCell>{record.description}</TableCell>
                <TableCell>{record.work_order_number || '—'}</TableCell>
                <TableCell className='text-right'>{record.total_cost == null ? '—' : '$' + Number(record.total_cost).toFixed(2)}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className='py-8 text-center'>No maintenance history recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meter History</CardTitle>
          <CardDescription>Hours, mileage, cycles, usage counts, and other tracked readings.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recorded</TableHead>
              <TableHead>Meter</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.meterReadings.length ? detail.meterReadings.map((record: any) => (
              <TableRow key={record.id}>
                <TableCell>{new Date(record.recorded_at).toLocaleString()}</TableCell>
                <TableCell>{meterTypeLabels[record.meter_type] || record.meter_type}</TableCell>
                <TableCell>{record.reading}{record.unit ? ' ' + record.unit : ''}</TableCell>
                <TableCell>{record.notes || '—'}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={4} className='py-8 text-center'>No meter readings recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignment History</CardTitle>
          <CardDescription>Custody and Location history for this asset.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Assigned</TableHead>
              <TableHead>Returned</TableHead>
              <TableHead>Personnel</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.assignments.length ? detail.assignments.map((record: any) => (
              <TableRow key={record.id}>
                <TableCell>{new Date(record.assigned_at).toLocaleString()}</TableCell>
                <TableCell>{record.returned_at ? new Date(record.returned_at).toLocaleString() : 'Current'}</TableCell>
                <TableCell>{record.forge_personnel ? record.forge_personnel.first_name + ' ' + record.forge_personnel.last_name : '—'}</TableCell>
                <TableCell>{record.locations?.name || '—'}</TableCell>
                <TableCell>{record.divisions?.name || '—'}</TableCell>
                <TableCell>{record.assignment_type}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className='py-8 text-center'>No assignment history recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Important lifecycle and operational events for this asset.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {detail.activity.length ? detail.activity.map((record: any) => (
            <div key={record.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium capitalize'>{String(record.activity_type).replaceAll('_', ' ')}</div>
                <div className='text-textSecondary text-xs'>{new Date(record.created_at).toLocaleString()}</div>
              </div>
              {record.message ? <div className='text-textSecondary mt-1 text-sm'>{record.message}</div> : null}
            </div>
          )) : <div className='text-textSecondary text-sm'>No activity has been recorded yet.</div>}
        </CardContent>
      </Card>

      {canRetire && !asset.retired_at ? <AssetRetireCard assetId={asset.id} /> : null}
    </div>
  )
}

export default AssetDetailPage
