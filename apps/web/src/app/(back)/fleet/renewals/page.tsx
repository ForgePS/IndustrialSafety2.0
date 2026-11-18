import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import VehiclePageHeader from '@/components/fleet/VehiclePageHeader'
import { VehiclePill } from '@/components/fleet/VehicleStatusBadge'
import { loadFleetSettings } from '@/lib/forgeFleetAccess'
import { daysUntil, registrationDueDate, renewalBucket, RENEWAL_BUCKET_LABELS, vehicleDisplayName } from '@/lib/forgeFleetRules'
import { DOCUMENT_TYPE_LABELS, allowedKeys, loadScopedVehicles } from '@/lib/forgeFleetVehicles'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Fleet Renewals' }

type Item = { key: string; vehicle: any; kind: string; due: string; days: number; detail?: string | null }

const KIND_FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'registration', label: 'Registration' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'inspection', label: 'Annual inspection' },
  { value: 'document', label: 'Documents' }
]

/**
 * Port slice 11: everything coming due (1.0's renewals view): registration, insurance expiry, annual
 * inspection and document expiry dates, grouped overdue / within the reminder window / within 90 days / later.
 */
const RenewalsPage = async ({ searchParams }: { searchParams: Promise<{ kind?: string }> }) => {
  const context = await requireTenantPermission('fleet.view')
  const organizationId = context.activeOrganization.id
  const permissions = allowedKeys(context)
  const { kind } = await searchParams
  const [vehicles, settings] = await Promise.all([loadScopedVehicles({ context }), loadFleetSettings(organizationId)])
  const warningDays = settings.renewal_warning_days
  const byId = new Map(vehicles.map(vehicle => [vehicle.id as string, vehicle]))

  const { data: documents } = byId.size
    ? await (createServiceRoleClient() as any)
        .from('forge_fleet_documents')
        .select('id, vehicle_id, document_type, title, file_name, expires_on')
        .eq('organization_id', organizationId)
        .is('archived_at', null)
        .not('expires_on', 'is', null)
        .in('vehicle_id', [...byId.keys()])
    : { data: [] }

  const items: Item[] = []

  const add = (vehicle: any, itemKind: string, due: string | null, detail?: string | null, key?: string) => {
    if (due) items.push({ key: key || `${vehicle.id}-${itemKind}`, vehicle, kind: itemKind, due, days: daysUntil(due), detail })
  }

  let noRegistration = 0

  for (const vehicle of vehicles) {
    const registration = registrationDueDate(vehicle)

    if (!registration) noRegistration++
    add(vehicle, 'registration', registration, vehicle.registration_renewal_date ? null : 'Renewal month')
    add(vehicle, 'insurance', vehicle.insurance_expires_on, vehicle.insurance_company)
    add(vehicle, 'inspection', vehicle.annual_inspection_due_on)
  }

  for (const document of (documents || []) as any[]) {
    const vehicle = byId.get(document.vehicle_id)

    if (vehicle) add(vehicle, 'document', document.expires_on, `${DOCUMENT_TYPE_LABELS[document.document_type as keyof typeof DOCUMENT_TYPE_LABELS] || document.document_type}: ${document.title || document.file_name}`, document.id)
  }

  const shown = items.filter(item => !kind || item.kind === kind).sort((a, b) => a.days - b.days)

  const groups = [
    { key: 'overdue', title: 'Overdue', tone: 'critical' as const, items: shown.filter(item => item.days < 0) },
    { key: 'soon', title: `Due within ${warningDays} days`, tone: 'pending' as const, items: shown.filter(item => item.days >= 0 && item.days <= warningDays) },
    { key: 'upcoming', title: 'Due within 90 days', tone: 'muted' as const, items: shown.filter(item => item.days > warningDays && item.days <= Math.max(90, warningDays)) },
    { key: 'later', title: 'Later', tone: 'muted' as const, items: shown.filter(item => item.days > Math.max(90, warningDays)) }
  ]

  const KIND_LABEL: Record<string, string> = { registration: 'Registration', insurance: 'Insurance expires', inspection: 'Annual inspection', document: 'Document expires' }

  return (
    <div className='flex flex-col gap-6'>
      <VehiclePageHeader active='renewals' permissions={permissions} subtitle={`Registration, insurance, annual inspection and document dates. Reminders start ${warningDays} days ahead.`} />

      <div className='flex flex-wrap gap-2 text-sm'>
        {KIND_FILTERS.map(filter => (
          <Link
            key={filter.value}
            href={filter.value ? `/fleet/renewals?kind=${filter.value}` : '/fleet/renewals'}
            className={'rounded-md border px-3 py-1 ' + ((kind || '') === filter.value ? 'border-primary text-primary' : 'text-textSecondary')}
          >
            {filter.label}
          </Link>
        ))}
        {noRegistration && (!kind || kind === 'registration') ? <span className='text-textSecondary self-center'>{noRegistration} vehicle(s) have no registration date or month.</span> : null}
      </div>

      {groups.map(group => (
        <Card key={group.key} data-renewal-group={group.key}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              {group.title} <VehiclePill tone={group.items.length ? group.tone : 'muted'}>{group.items.length}</VehiclePill>
            </CardTitle>
          </CardHeader>
          {group.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Bucket</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map(item => (
                  <TableRow key={item.key} data-renewal={item.vehicle.vehicle_number} data-renewal-kind={item.kind}>
                    <TableCell>
                      <Link className='text-primary font-semibold hover:underline' href={'/fleet/vehicles/' + item.vehicle.id}>
                        {vehicleDisplayName(item.vehicle)}
                      </Link>
                      <div className='text-textSecondary text-xs'>{item.vehicle.vehicle_number}</div>
                    </TableCell>
                    <TableCell>
                      {KIND_LABEL[item.kind]}
                      {item.detail ? <div className='text-textSecondary text-xs'>{item.detail}</div> : null}
                    </TableCell>
                    <TableCell>
                      {item.due}
                      <div className='text-textSecondary text-xs'>{item.days < 0 ? `${-item.days} days overdue` : item.days === 0 ? 'Today' : `In ${item.days} days`}</div>
                    </TableCell>
                    <TableCell>{RENEWAL_BUCKET_LABELS[renewalBucket(item.due)]}</TableCell>
                    <TableCell>{item.vehicle.locations?.name || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </Card>
      ))}
    </div>
  )
}

export default RenewalsPage
