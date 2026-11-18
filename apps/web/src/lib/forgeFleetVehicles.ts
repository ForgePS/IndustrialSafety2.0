import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { csvResponse } from '@/lib/forgeCsv'
import { loadVehicle, vehicleScopeFilter, vehicleWithinScope } from '@/lib/forgeFleetAccess'
import { INVENTORY_COLUMNS, REMOVED_COLUMNS } from '@/lib/forgeFleetImportRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/**
 * Port slice 11: vehicle registry loaders and helpers shared by the /fleet pages, actions and route handlers.
 * Server only. Callers check the permission; these apply the vehicle scope.
 */

const db = () => createServiceRoleClient() as any

export type FleetContext = {
  user: { id: string }
  activeOrganization: { id: string }
  permission: { scope?: string | null }
  access: { effective: Array<{ permissionKey: string; allowed: boolean; scope?: string | null }> }
}

export const allowedKeys = (context: Pick<FleetContext, 'access'>) => context.access.effective.filter(item => item.allowed).map(item => item.permissionKey)

export const permissionFor = (context: Pick<FleetContext, 'access'>, key: string) => context.access.effective.find(item => item.permissionKey === key && item.allowed) || null

export const VEHICLE_LIST_SELECT =
  '*, locations(name), divisions(name), driver:forge_personnel!forge_fleet_vehicles_assigned_driver_personnel_id_fkey(id, first_name, last_name, preferred_name, employee_number)'

export const personName = (person: { first_name?: string | null; last_name?: string | null; preferred_name?: string | null } | null | undefined) =>
  person ? `${person.preferred_name || person.first_name || ''} ${person.last_name || ''}`.trim() || 'Unnamed' : ''

/** Vehicles in the viewer's scope (not archived). `removed`: only removed / sold / disposed, else only the others. */
export const loadScopedVehicles = async ({ context, scope, removed = false }: { context: FleetContext; scope?: string | null; removed?: boolean }) => {
  const organizationId = context.activeOrganization.id
  const filter = await vehicleScopeFilter({ organizationId, userId: context.user.id, scope: scope ?? context.permission.scope ?? null })

  let query = db().from('forge_fleet_vehicles').select(VEHICLE_LIST_SELECT).eq('organization_id', organizationId).is('archived_at', null)

  query = removed ? query.in('status', ['removed', 'sold', 'disposed']) : query.not('status', 'in', '(removed,sold,disposed)')

  if (filter) query = query.or(filter)

  const { data } = await query.order('vehicle_number').limit(5000)

  return (data || []) as any[]
}

/** The vehicle when it exists, is not archived and is within `scope`; otherwise null. */
export const loadVehicleInScope = async ({ context, vehicleId, scope }: { context: FleetContext; vehicleId: string; scope?: string | null }) => {
  if (!/^[0-9a-f-]{36}$/i.test(vehicleId)) return null

  const organizationId = context.activeOrganization.id
  const vehicle = await loadVehicle({ organizationId, vehicleId })

  if (!vehicle || vehicle.archived_at) return null

  const ok = await vehicleWithinScope({ organizationId, userId: context.user.id, scope: scope ?? context.permission.scope ?? null, vehicle })

  return ok ? vehicle : null
}

/** Active personnel in the company, for the driver picker. */
export const loadDriverCandidates = async (organizationId: string) => {
  const { data } = await db()
    .from('forge_personnel')
    .select('id, first_name, last_name, preferred_name, employee_number, is_company_driver, is_dot_driver')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .eq('employment_status', 'active')
    .order('last_name')
    .order('first_name')
    .limit(5000)

  return ((data || []) as any[]).map(person => ({
    id: person.id as string,
    name: personName(person),
    employeeNumber: (person.employee_number as string | null) || null,
    isCompanyDriver: Boolean(person.is_company_driver)
  }))
}

export const loadLocationsAndDivisions = async (organizationId: string) => {
  const [locations, divisions] = await Promise.all([
    db().from('locations').select('id, name, code, division_id, is_active').eq('organization_id', organizationId).order('name'),
    db().from('divisions').select('id, name, code, is_active').eq('organization_id', organizationId).order('name')
  ])

  return {
    locations: ((locations.data || []) as any[]).map(row => ({ id: row.id as string, name: row.name as string, code: (row.code as string) || null, divisionId: (row.division_id as string) || null, active: row.is_active !== false })),
    divisions: ((divisions.data || []) as any[]).map(row => ({ id: row.id as string, name: row.name as string, code: (row.code as string) || null, active: row.is_active !== false }))
  }
}

/**
 * Drivers of company vehicles are company drivers. Setting forge_personnel.is_company_driver lets DOT's
 * forge_personnel_dot_after trigger add them to the insurance / MVR roster (or reopen a removed roster
 * row), like 1.0's ensureCompanyDriverRosterEntry. Returns true when the flag was turned on.
 */
export const ensureCompanyDriver = async ({ organizationId, personnelId, actorUserId }: { organizationId: string; personnelId: string; actorUserId: string | null }) => {
  const { data } = await db()
    .from('forge_personnel')
    .update({ is_company_driver: true, updated_by: actorUserId })
    .eq('organization_id', organizationId)
    .eq('id', personnelId)
    .eq('is_company_driver', false)
    .select('id')

  return Boolean(data?.length)
}

/** A friendly message for a vehicle write error. */
export const vehicleDbMessage = (error: { code?: string; message?: string } | null | undefined, fallback: string) => {
  if (!error) return fallback

  const message = error.message || ''

  if (error.code === '23505') {
    if (message.includes('vin')) return 'Another vehicle already has this VIN.'
    if (message.includes('unit')) return 'Another vehicle already has this unit number.'
    if (message.includes('source')) return 'This vehicle was already imported.'

    return 'Another vehicle already has these details.'
  }

  if (error.code === '23514' || error.code === '22023' || error.code === 'P0001' || error.code === 'P0002' || error.code === '23503') {
    return message.replace(/^.*?ERROR:\s*/, '') || fallback
  }

  return fallback
}

/** Check that a location / division id belongs to the company. */
export const validPlace = async (organizationId: string, table: 'locations' | 'divisions', id: string | null) => {
  if (!id) return true
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false

  const { data } = await db().from(table).select('id').eq('organization_id', organizationId).eq('id', id).maybeSingle()

  return Boolean(data)
}

export const validDriver = async (organizationId: string, personnelId: string | null) => {
  if (!personnelId) return true
  if (!/^[0-9a-f-]{36}$/i.test(personnelId)) return false

  const { data } = await db()
    .from('forge_personnel')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('id', personnelId)
    .is('archived_at', null)
    .eq('employment_status', 'active')
    .maybeSingle()

  return Boolean(data)
}

export const DOCUMENT_TYPES = ['title', 'registration', 'insurance_card', 'insurance_policy', 'inspection', 'maintenance', 'other'] as const

export const DOCUMENT_TYPE_LABELS: Record<(typeof DOCUMENT_TYPES)[number], string> = {
  title: 'Title',
  registration: 'Registration',
  insurance_card: 'Insurance card',
  insurance_policy: 'Insurance policy',
  inspection: 'Inspection',
  maintenance: 'Maintenance',
  other: 'Other'
}

export const FLEET_DOCUMENT_MAX_BYTES = 12 * 1024 * 1024
export const FLEET_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const

/** Content type from the file's first bytes (JPEG, PNG, WebP or PDF), or null. */
export const sniffFleetDocument = (bytes: Uint8Array): (typeof FLEET_DOCUMENT_TYPES)[number] | null => {
  const at = (offset: number, text: string) => [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0))

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && at(1, 'PNG')) return 'image/png'
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp'
  if (at(0, '%PDF-')) return 'application/pdf'

  return null
}

/**
 * Fleet CSV reports (fleet.export), limited to the vehicles in the export permission's scope.
 * removed: false = vehicles in the fleet; true = removed / sold / disposed.
 */
export const fleetReportResponse = async (removed: boolean) => {
  const context = (await tenantPermissionOrNull('fleet.export')) as unknown as FleetContext | null

  if (!context) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const vehicles = await loadScopedVehicles({ context, removed })
  const columns = removed ? REMOVED_COLUMNS : INVENTORY_COLUMNS
  const today = new Date().toISOString().slice(0, 10)

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId: context.activeOrganization.id,
    action: 'fleet.report_exported',
    entityType: 'fleet_report',
    entityId: context.activeOrganization.id,
    afterValue: { report: removed ? 'removed' : 'inventory', rows: vehicles.length }
  }).catch(() => undefined)

  return csvResponse(
    `fleet-${removed ? 'removed' : 'inventory'}-${today}.csv`,
    columns.map(([header]) => header),
    vehicles.map(vehicle => columns.map(([, value]) => value(vehicle)))
  )
}
