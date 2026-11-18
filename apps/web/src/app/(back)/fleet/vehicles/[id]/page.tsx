import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TbEdit, TbPlus } from 'react-icons/tb'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import VehicleActionsPanel from '@/components/fleet/VehicleActionsPanel'
import VehicleDocuments from '@/components/fleet/VehicleDocuments'
import VehiclePageHeader from '@/components/fleet/VehiclePageHeader'
import VehicleQrCard from '@/components/fleet/VehicleQrCard'
import VehicleStatusBadge, { VehiclePill } from '@/components/fleet/VehicleStatusBadge'
import { loadFleetSettings } from '@/lib/forgeFleetAccess'
import { VEHICLE_FIELDS } from '@/lib/forgeFleetImportRules'
import {
  MAINTENANCE_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  expiryState,
  maintenanceDueState,
  registrationDueDate,
  vehicleDisplayName,
  vinWarning,
  type MaintenanceType,
  type VehicleStatus
} from '@/lib/forgeFleetRules'
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, allowedKeys, loadDriverCandidates, loadVehicleInScope, personName } from '@/lib/forgeFleetVehicles'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Vehicle' }

const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

const DVIR_STATUS: Record<string, { label: string; tone: 'ok' | 'critical' | 'pending' }> = {
  open: { label: 'Defects open', tone: 'critical' },
  needs_review: { label: 'Needs driver review', tone: 'pending' },
  closed: { label: 'Closed', tone: 'ok' }
}

const STATUS_SOURCE: Record<string, string> = {
  record_edit: 'Vehicle record',
  dvir: 'DVIR',
  dvir_certified: 'DVIR certified',
  qr_scan: 'QR scan',
  qr_issue: 'QR issue report',
  import: 'Import',
  disposal: 'Removal'
}

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className='text-textSecondary text-xs'>{label}</div>
    <div className='text-sm'>{children || '—'}</div>
  </div>
)

const VehiclePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('fleet.view')
  const vehicle = await loadVehicleInScope({ context, vehicleId: id })

  if (!vehicle) notFound()

  const organizationId = context.activeOrganization.id
  const permissions = allowedKeys(context)
  const can = (key: string) => permissions.includes(key)
  const supabase = createServiceRoleClient() as any
  const byVehicle = (table: string, select = '*') => supabase.from(table).select(select).eq('organization_id', organizationId).eq('vehicle_id', vehicle.id)

  const [assignments, meters, statuses, activity, documents, dvirs, maintenance, settings, drivers] = await Promise.all([
    byVehicle('forge_fleet_assignment_history', '*, person:forge_personnel(first_name, last_name, preferred_name, employee_number)').order('effective_at', { ascending: false }).limit(25),
    byVehicle('forge_fleet_meter_readings').order('recorded_at', { ascending: false }).limit(25),
    byVehicle('forge_fleet_status_history').order('changed_at', { ascending: false }).limit(25),
    byVehicle('forge_fleet_activity').order('created_at', { ascending: false }).limit(30),
    byVehicle('forge_fleet_documents').is('archived_at', null).order('uploaded_at', { ascending: false }),
    byVehicle('forge_fleet_dvirs', 'id, dvir_number, trip_type, inspection_date, status, condition_satisfactory, driver_name').is('archived_at', null).order('inspection_date', { ascending: false }).limit(5),
    byVehicle('forge_fleet_maintenance', 'id, maintenance_number, title, maintenance_type, status, due_on, due_mileage').eq('status', 'open').order('due_on', { ascending: true, nullsFirst: false }).limit(10),
    loadFleetSettings(organizationId),
    can('fleet.edit') ? loadDriverCandidates(organizationId) : Promise.resolve([])
  ])

  const warningDays = settings.renewal_warning_days
  const registrationDue = registrationDueDate(vehicle)
  const removed = ['removed', 'sold', 'disposed'].includes(vehicle.status)

  const label = (key: string) => {
    const field = VEHICLE_FIELDS.find(item => item.key === key)
    const value = vehicle[key]

    if (field?.kind === 'bool') return value ? 'Yes' : 'No'
    if (field?.labels) return field.labels[value] || value

    return value
  }

  const dateFact = (value: string | null) => {
    if (!value) return null

    const state = expiryState(value, warningDays)

    return (
      <span className={state === 'expired' ? 'text-destructive font-semibold' : state === 'expiring' ? 'font-semibold text-amber-600' : ''}>
        {value}
        {state === 'expired' ? ' (overdue)' : state === 'expiring' ? ' (due soon)' : ''}
      </span>
    )
  }

  const vin = vinWarning(vehicle.vin)

  return (
    <div className='flex flex-col gap-6'>
      <VehiclePageHeader
        active='vehicles'
        permissions={permissions}
        title={vehicleDisplayName(vehicle)}
        subtitle={
          <span className='flex flex-wrap items-center gap-2'>
            <span>{vehicle.vehicle_number}</span>
            <VehicleStatusBadge status={vehicle.status} />
            {vehicle.dot_regulated ? <VehiclePill tone='muted'>DOT regulated</VehiclePill> : null}
          </span>
        }
        actions={
          can('fleet.edit') && !removed ? (
            <Button variant='outline' asChild>
              <Link href={`/fleet/vehicles/${vehicle.id}/edit`}>
                <TbEdit />
                Edit
              </Link>
            </Button>
          ) : null
        }
      />

      {vehicle.status === 'out_of_service' ? (
        <div className='border-destructive bg-destructive/10 text-destructive rounded-md border p-4 text-sm' role='status' data-testid='vehicle-oos-banner'>
          <strong>Out of service.</strong> {vehicle.out_of_service_reason || 'No reason given.'}
        </div>
      ) : null}
      {removed ? (
        <div className='bg-secondary rounded-md border p-4 text-sm' role='status'>
          <strong>{VEHICLE_STATUS_LABELS[vehicle.status as VehicleStatus]}</strong>
          {vehicle.disposition_date ? ` on ${vehicle.disposition_date}` : ''}. {vehicle.disposition_notes || ''}
        </div>
      ) : null}

      <div className='grid gap-6 xl:grid-cols-3'>
        <div className='flex flex-col gap-6 xl:col-span-2'>
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              <Fact label='Unit number'>{vehicle.unit_number}</Fact>
              <Fact label='Type'>{vehicle.vehicle_type === 'other' && vehicle.custom_type_label ? vehicle.custom_type_label : label('vehicle_type')}</Fact>
              <Fact label='Year / make / model'>{[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')}</Fact>
              <Fact label='Color'>{vehicle.color}</Fact>
              <Fact label='VIN'>
                {vehicle.vin ? <span className='font-mono'>{vehicle.vin}</span> : null}
                {vin ? <div className='text-xs text-amber-700 dark:text-amber-300'>{vin}</div> : null}
              </Fact>
              <Fact label='Serial number'>{vehicle.serial_number}</Fact>
              <Fact label='License plate'>{[vehicle.license_plate, vehicle.license_state].filter(Boolean).join(' · ')}</Fact>
              <Fact label='Registration due'>{dateFact(registrationDue)}</Fact>
              <Fact label='Location'>{vehicle.locations?.name}</Fact>
              <Fact label='Division'>{vehicle.divisions?.name}</Fact>
              <Fact label='Driver'>{vehicle.driver ? `${personName(vehicle.driver)}${vehicle.driver.employee_number ? ' · #' + vehicle.driver.employee_number : ''}` : null}</Fact>
              <Fact label='Mileage'>{vehicle.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') : null}</Fact>
              <Fact label='Engine hours'>{vehicle.engine_hours != null ? Number(vehicle.engine_hours).toLocaleString('en-US') : null}</Fact>
              <Fact label='GVWR (lbs)'>{vehicle.gvwr_lbs ? Number(vehicle.gvwr_lbs).toLocaleString('en-US') : null}</Fact>
              <Fact label='Annual inspection due'>{dateFact(vehicle.annual_inspection_due_on)}</Fact>
              <Fact label='Insurance'>
                {label('insurance_status')}
                {vehicle.insurance_company ? ` · ${vehicle.insurance_company}` : ''}
                {vehicle.insurance_policy_number ? ` · #${vehicle.insurance_policy_number}` : ''}
              </Fact>
              <Fact label='Insurance expires'>{dateFact(vehicle.insurance_expires_on)}</Fact>
              <Fact label='Agent'>{[vehicle.insurance_agent_name, vehicle.insurance_agent_phone, vehicle.insurance_agent_email].filter(Boolean).join(' · ')}</Fact>
              <Fact label='County assessment'>{label('county_assessment_status')}</Fact>
              <Fact label='Commute use'>{label('commute_use_status')}</Fact>
              <Fact label='Not on vehicle fringe SS'>{label('vehicle_fringe')}</Fact>
              <Fact label='Form 2290'>{label('form_2290_status')}</Fact>
              <Fact label='IRP'>{label('irp_status')}</Fact>
              {vehicle.notes ? (
                <div className='sm:col-span-2 lg:col-span-3'>
                  <Fact label='Notes'>
                    <span className='whitespace-pre-wrap'>{vehicle.notes}</span>
                  </Fact>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card data-testid='vehicle-dvirs'>
            <CardHeader className='flex flex-row items-center justify-between'>
              <CardTitle>Recent DVIRs</CardTitle>
              <div className='flex gap-2'>
                <Button size='sm' variant='outline' asChild>
                  <Link href={`/fleet/dvirs?vehicle=${vehicle.id}`}>All DVIRs</Link>
                </Button>
                {can('fleet.dvir') && !removed ? (
                  <Button size='sm' asChild>
                    <Link href={`/fleet/dvirs/new?vehicle=${vehicle.id}`}>
                      <TbPlus />
                      New DVIR
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {(dvirs.data || []).length ? (
                <ul className='divide-y text-sm'>
                  {(dvirs.data as any[]).map(dvir => (
                    <li key={dvir.id} className='flex flex-wrap items-center justify-between gap-2 py-2'>
                      <Link className='text-primary hover:underline' href={`/fleet/dvirs/${dvir.id}`}>
                        {dvir.dvir_number} · {dvir.inspection_date} · {dvir.trip_type === 'pre_trip' ? 'Pre-trip' : 'Post-trip'} · {dvir.driver_name}
                      </Link>
                      <VehiclePill tone={DVIR_STATUS[dvir.status]?.tone || 'muted'}>{dvir.condition_satisfactory && dvir.status === 'closed' ? 'Satisfactory' : DVIR_STATUS[dvir.status]?.label || dvir.status}</VehiclePill>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-textSecondary text-sm'>No DVIRs yet.</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid='vehicle-maintenance'>
            <CardHeader className='flex flex-row items-center justify-between'>
              <CardTitle>Open maintenance</CardTitle>
              <div className='flex gap-2'>
                <Button size='sm' variant='outline' asChild>
                  <Link href={`/fleet/maintenance?vehicle=${vehicle.id}`}>All maintenance</Link>
                </Button>
                {can('fleet.maintenance') && !removed ? (
                  <Button size='sm' asChild>
                    <Link href={`/fleet/maintenance/new?vehicle=${vehicle.id}`}>
                      <TbPlus />
                      New
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {(maintenance.data || []).length ? (
                <ul className='divide-y text-sm'>
                  {(maintenance.data as any[]).map(record => {
                    const state = maintenanceDueState(record, vehicle.mileage, warningDays)

                    return (
                      <li key={record.id} className='flex flex-wrap items-center justify-between gap-2 py-2'>
                        <Link className='text-primary hover:underline' href={`/fleet/maintenance/${record.id}`}>
                          {record.maintenance_number} · {record.title} · {MAINTENANCE_TYPE_LABELS[record.maintenance_type as MaintenanceType] || record.maintenance_type}
                        </Link>
                        <span className='flex items-center gap-2'>
                          <span className='text-textSecondary text-xs'>
                            {[record.due_on && `Due ${record.due_on}`, record.due_mileage != null && `at ${Number(record.due_mileage).toLocaleString('en-US')} mi`].filter(Boolean).join(' ')}
                          </span>
                          {state === 'overdue' ? <VehiclePill tone='critical'>Overdue</VehiclePill> : state === 'due_soon' ? <VehiclePill tone='pending'>Due soon</VehiclePill> : null}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className='text-textSecondary text-sm'>No open maintenance.</p>
              )}
            </CardContent>
          </Card>

          <VehicleDocuments
            vehicleId={vehicle.id}
            canEdit={can('fleet.edit') && !removed}
            types={DOCUMENT_TYPES.map(value => ({ value, label: DOCUMENT_TYPE_LABELS[value] }))}
            documents={((documents.data || []) as any[]).map(document => ({
              id: document.id,
              documentType: document.document_type,
              typeLabel: DOCUMENT_TYPE_LABELS[document.document_type as keyof typeof DOCUMENT_TYPE_LABELS] || document.document_type,
              title: document.title,
              fileName: document.file_name,
              expiresOn: document.expires_on,
              expiry: expiryState(document.expires_on, warningDays),
              uploadedAt: document.uploaded_at,
              sizeBytes: document.size_bytes
            }))}
          />

          <Card data-testid='vehicle-status-history'>
            <CardHeader>
              <CardTitle>Status history</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(statuses.data || []).length ? (
                  (statuses.data as any[]).map(row => (
                    <TableRow key={row.id} data-status-change={row.to_status}>
                      <TableCell>{when(row.changed_at)}</TableCell>
                      <TableCell>
                        {VEHICLE_STATUS_LABELS[row.from_status as VehicleStatus] || row.from_status || '—'} → {VEHICLE_STATUS_LABELS[row.to_status as VehicleStatus] || row.to_status}
                      </TableCell>
                      <TableCell>{row.reason || '—'}</TableCell>
                      <TableCell>
                        {STATUS_SOURCE[row.source] || row.source}
                        {row.actor_name ? ` · ${row.actor_name}` : ''}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className='py-6 text-center'>
                      No status changes yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <div className='grid gap-6 lg:grid-cols-2'>
            <Card data-testid='vehicle-assignment-history'>
              <CardHeader>
                <CardTitle>Driver history</CardTitle>
              </CardHeader>
              <CardContent>
                {(assignments.data || []).length ? (
                  <ul className='divide-y text-sm'>
                    {(assignments.data as any[]).map(row => (
                      <li key={row.id} className='py-2' data-assignment={row.action}>
                        <div>
                          <span className='font-semibold'>{row.action === 'assign' ? 'Assigned' : 'Unassigned'}</span> {personName(row.person) || 'a removed employee'}
                        </div>
                        <div className='text-textSecondary text-xs'>
                          {when(row.effective_at)}
                          {row.notes ? ` · ${row.notes}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className='text-textSecondary text-sm'>No driver changes yet.</p>
                )}
              </CardContent>
            </Card>

            <Card data-testid='vehicle-meter-history'>
              <CardHeader>
                <CardTitle>Mileage and engine hours</CardTitle>
              </CardHeader>
              <CardContent>
                {(meters.data || []).length ? (
                  <ul className='divide-y text-sm'>
                    {(meters.data as any[]).map(row => (
                      <li key={row.id} className='py-2' data-meter={row.meter} data-value={Number(row.value)}>
                        <div>
                          <span className='font-semibold'>{Number(row.value).toLocaleString('en-US')}</span> {row.meter === 'mileage' ? 'mi' : 'engine hours'}
                          {row.is_correction ? <span className='ml-2 text-xs text-amber-700 dark:text-amber-300'>correction</span> : null}
                        </div>
                        <div className='text-textSecondary text-xs'>
                          {when(row.recorded_at)} · {row.source}
                          {row.notes ? ` · ${row.notes}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className='text-textSecondary text-sm'>No readings yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className='flex flex-col gap-6'>
          <VehicleActionsPanel
            vehicle={{ id: vehicle.id, status: vehicle.status, assignedDriverId: vehicle.assigned_driver_personnel_id, mileage: vehicle.mileage, engineHours: vehicle.engine_hours }}
            drivers={drivers}
            canEdit={can('fleet.edit')}
            canMeter={can('fleet.edit') || can('fleet.maintenance')}
            canRetire={can('fleet.retire')}
          />

          <VehicleQrCard vehicleId={vehicle.id} organizationId={organizationId} canView={can('qr_management.view')} canCreate={can('qr_management.create')} />

          <Card data-testid='vehicle-activity'>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {(activity.data || []).length ? (
                <ul className='divide-y text-sm'>
                  {(activity.data as any[]).map(row => (
                    <li key={row.id} className='py-2'>
                      <div>{row.message || row.activity_type}</div>
                      <div className='text-textSecondary text-xs'>{when(row.created_at)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-textSecondary text-sm'>No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default VehiclePage
