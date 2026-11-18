import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { MaintenanceCancelForm, MaintenanceCompleteForm } from '@/components/fleet/MaintenanceCloseForms'
import { FleetPageHeader, MaintenanceDueBadge, allowedKeys } from '@/components/fleet/MaintenanceBadges'
import MaintenanceForm from '@/components/fleet/MaintenanceForm'
import { loadFleetSettings, vehicleWithinScope } from '@/lib/forgeFleetAccess'
import { dueStateOf, loadMaintenanceRecord } from '@/lib/forgeFleetMaintenance'
import { MAINTENANCE_STATUS_LABELS, centsToDollars } from '@/lib/forgeFleetMaintenanceRules'
import { MAINTENANCE_TYPE_LABELS, todayIso, vehicleDisplayName } from '@/lib/forgeFleetRules'
import type { MaintenanceType } from '@/lib/forgeFleetRules'
import { formatUsDate } from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Maintenance' }

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className='text-textSecondary text-xs'>{label}</div>
    <div className='text-sm'>{children || '—'}</div>
  </div>
)

const MaintenanceDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('fleet.view')
  const organizationId = context.activeOrganization.id

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const record = await loadMaintenanceRecord({ organizationId, id })

  if (!record?.vehicle || !(await vehicleWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, vehicle: record.vehicle }))) notFound()

  const permissions = allowedKeys(context)
  const maintenanceGrant = context.access.effective.find(item => item.permissionKey === 'fleet.maintenance' && item.allowed)

  const canChange =
    Boolean(maintenanceGrant) &&
    record.status === 'open' &&
    (await vehicleWithinScope({ organizationId, userId: context.user.id, scope: maintenanceGrant!.scope, vehicle: record.vehicle }))

  const settings = await loadFleetSettings(organizationId)
  const state = dueStateOf(record, settings.renewal_warning_days)
  const today = todayIso()

  // The item opened when this one was completed, and the one this item follows.
  const supabase = createServiceRoleClient() as any

  const [{ data: followUps }, { data: previous }] = await Promise.all([
    supabase.from('forge_fleet_maintenance').select('id, maintenance_number').eq('organization_id', organizationId).eq('repeated_from_id', record.id).limit(1),
    record.repeated_from_id
      ? supabase.from('forge_fleet_maintenance').select('id, maintenance_number').eq('organization_id', organizationId).eq('id', record.repeated_from_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])

  const next = followUps?.[0] || null

  return (
    <div className='flex flex-col gap-6'>
      <FleetPageHeader
        active='maintenance'
        permissions={permissions}
        title='Fleet'
        subtitle={`${record.maintenance_number} · ${vehicleDisplayName(record.vehicle)}`}
      />

      <Card className='max-w-4xl'>
        <CardHeader>
          <CardTitle className='flex flex-wrap items-center gap-3' data-maintenance-status={record.status}>
            {record.title}
            {record.status === 'open' ? <MaintenanceDueBadge state={state} /> : null}
          </CardTitle>
          <CardDescription>
            <Link href={`/fleet/vehicles/${record.vehicle_id}`} className='text-primary hover:underline'>
              {vehicleDisplayName(record.vehicle)}
            </Link>
            {record.vehicle.mileage != null ? ` · ${record.vehicle.mileage.toLocaleString('en-US')} miles now` : ''}
            {' · '}
            <Link href={`/fleet/maintenance?vehicle=${record.vehicle_id}&status=all`} className='text-primary hover:underline'>
              All maintenance for this vehicle
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 md:grid-cols-4'>
          <Field label='Number'>{record.maintenance_number}</Field>
          <Field label='Status'>{MAINTENANCE_STATUS_LABELS[record.status as keyof typeof MAINTENANCE_STATUS_LABELS] || record.status}</Field>
          <Field label='Type'>{MAINTENANCE_TYPE_LABELS[record.maintenance_type as MaintenanceType] || record.maintenance_type}</Field>
          <Field label='Vendor'>{record.vendor}</Field>
          <Field label='Due date'>{formatUsDate(record.due_on)}</Field>
          <Field label='Due at mileage'>{record.due_mileage != null ? record.due_mileage.toLocaleString('en-US') : ''}</Field>
          <Field label='Repeats'>
            {[record.repeat_days ? `every ${record.repeat_days} days` : '', record.repeat_miles ? `every ${record.repeat_miles.toLocaleString('en-US')} miles` : ''].filter(Boolean).join(' or ')}
          </Field>
          <Field label='Cost'>{centsToDollars(record.cost_cents)}</Field>
          {record.status === 'completed' ? (
            <>
              <Field label='Completed on'>{formatUsDate(record.completed_on)}</Field>
              <Field label='Odometer at completion'>{record.completed_mileage != null ? record.completed_mileage.toLocaleString('en-US') : ''}</Field>
            </>
          ) : null}
          {record.dvir ? (
            <Field label='From DVIR'>
              <Link href={`/fleet/dvirs/${record.dvir.id}`} className='text-primary hover:underline' data-dvir-link={record.dvir.id}>
                {record.dvir.dvir_number}
              </Link>
            </Field>
          ) : null}
          {next ? (
            <Field label='Next scheduled'>
              <Link href={`/fleet/maintenance/${next.id}`} className='text-primary hover:underline' data-next-maintenance={next.maintenance_number}>
                {next.maintenance_number}
              </Link>
            </Field>
          ) : null}
          {previous ? (
            <Field label='Follows'>
              <Link href={`/fleet/maintenance/${previous.id}`} className='text-primary hover:underline' data-previous-maintenance={previous.maintenance_number}>
                {previous.maintenance_number}
              </Link>
            </Field>
          ) : null}
          {record.notes ? (
            <div className='md:col-span-4'>
              <div className='text-textSecondary text-xs'>Notes</div>
              <p className='whitespace-pre-wrap text-sm'>{record.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canChange ? (
        <>
          <Card className='max-w-4xl'>
            <CardHeader>
              <CardTitle>Complete</CardTitle>
              <CardDescription>Record when the work was done.</CardDescription>
            </CardHeader>
            <CardContent>
              <MaintenanceCompleteForm recordId={record.id} today={today} currentMileage={record.vehicle.mileage ?? null} repeats={Boolean(record.repeat_days || record.repeat_miles)} />
            </CardContent>
          </Card>

          <Card className='max-w-4xl'>
            <CardHeader>
              <CardTitle>Edit</CardTitle>
            </CardHeader>
            <CardContent>
              <MaintenanceForm
                recordId={record.id}
                initial={{
                  vehicleId: record.vehicle_id,
                  title: record.title,
                  maintenanceType: record.maintenance_type,
                  dueOn: record.due_on || '',
                  dueMileage: record.due_mileage != null ? String(record.due_mileage) : '',
                  vendor: record.vendor || '',
                  cost: record.cost_cents != null ? (record.cost_cents / 100).toFixed(2) : '',
                  repeatDays: record.repeat_days != null ? String(record.repeat_days) : '',
                  repeatMiles: record.repeat_miles != null ? String(record.repeat_miles) : '',
                  notes: record.notes || ''
                }}
              />
              <div className='mt-6 border-t pt-4'>
                <MaintenanceCancelForm recordId={record.id} />
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

export default MaintenanceDetailPage
