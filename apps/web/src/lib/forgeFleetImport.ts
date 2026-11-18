import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { fleetActivity, scopedVehicleIds, vehicleWithinScope } from '@/lib/forgeFleetAccess'
import { cleanVehicleInput, mapCsvHeaders, mapCsvRow, parseCsv, rowMatchKey, vehicleMatchKeys } from '@/lib/forgeFleetImportRules'
import { normalizeVin } from '@/lib/forgeFleetRules'
import { ensureCompanyDriver, vehicleDbMessage, type FleetContext } from '@/lib/forgeFleetVehicles'

/**
 * Port slice 11: CSV vehicle import (1.0 industrial.fleet.v1 template or our inventory export). Server only;
 * the caller checks fleet.create. Dry run first: every row reports what would happen and its problems.
 *
 * - Matches existing vehicles by VIN, else unit number, else license plate; only the columns in the file
 *   are changed on an existing vehicle, and an unchanged row writes nothing.
 * - Mileage / engine hours go in as meter readings (source import). A lower value on an existing vehicle is
 *   not recorded (corrections are made on the vehicle page).
 * - Driver: by employee number, else the exact name of one active employee.
 */

export const MAX_FLEET_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_FLEET_IMPORT_ROWS = 2000

export type FleetImportRow = {
  line: number
  label: string
  action: 'create' | 'update' | 'unchanged' | 'skip'
  vehicleId: string | null
  changes: string[]
  problems: string[]
  warnings: string[]
}

export type FleetImportSummary = {
  dryRun: boolean
  rows: FleetImportRow[]
  created: number
  updated: number
  unchanged: number
  skipped: number
  unknownColumns: string[]
}

const db = () => createServiceRoleClient() as any

const lower = (value: unknown) => String(value ?? '').trim().toLowerCase()

export const runFleetImport = async ({ context, text, dryRun }: { context: FleetContext; text: string; dryRun: boolean }): Promise<FleetImportSummary> => {
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const scope = context.permission.scope ?? null
  const table = parseCsv(text)

  if (table.length < 2) throw new Error('The file has no vehicle rows. The first row must be the column headings.')
  if (table.length - 1 > MAX_FLEET_IMPORT_ROWS) throw new Error(`Import at most ${MAX_FLEET_IMPORT_ROWS} vehicles at a time.`)

  const { keys, unknown } = mapCsvHeaders(table[0])

  if (!keys.some(key => key && key !== 'ignore')) throw new Error('None of the column headings were recognised. Start from the template.')

  const present = new Set(keys.filter(Boolean) as string[])
  const supabase = db()

  const [vehiclesResult, locationsResult, divisionsResult, personnelResult, inScope] = await Promise.all([
    supabase.from('forge_fleet_vehicles').select('*').eq('organization_id', organizationId).is('archived_at', null).limit(20000),
    supabase.from('locations').select('id, name, code, division_id').eq('organization_id', organizationId),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId),
    supabase
      .from('forge_personnel')
      .select('id, first_name, last_name, preferred_name, employee_number, is_company_driver')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .eq('employment_status', 'active')
      .limit(20000),
    scopedVehicleIds({ organizationId, userId, scope })
  ])

  const vehicles = (vehiclesResult.data || []) as any[]
  const byKey = new Map<string, any>()

  // VIN beats unit number beats plate: index in that order so the first key wins.
  for (const prefix of ['vin:', 'unit:', 'plate:']) {
    for (const vehicle of vehicles) {
      for (const matchKey of vehicleMatchKeys(vehicle)) if (matchKey.startsWith(prefix) && !byKey.has(matchKey)) byKey.set(matchKey, vehicle)
    }
  }

  const findPlace = (rows: any[], value: string | null) => {
    if (!value) return { id: null as string | null, missing: false }

    const match = rows.find(row => lower(row.name) === lower(value) || (row.code && lower(row.code) === lower(value)))

    return { id: (match?.id as string) || null, missing: !match }
  }

  const people = (personnelResult.data || []) as any[]

  const findDriver = (employeeNumber: string | null, name: string | null) => {
    if (employeeNumber) {
      const match = people.find(person => person.employee_number && lower(person.employee_number) === lower(employeeNumber))

      if (match) return { person: match }
    }

    if (name) {
      const byNumber = people.find(person => person.employee_number && lower(person.employee_number) === lower(name))

      if (byNumber) return { person: byNumber }

      const matches = people.filter(person =>
        [`${person.first_name} ${person.last_name}`, `${person.preferred_name || ''} ${person.last_name}`, `${person.last_name}, ${person.first_name}`].some(full => lower(full) === lower(name))
      )

      if (matches.length === 1) return { person: matches[0] }
      if (matches.length > 1) return { warning: `More than one employee is named "${name}"; add the employee number.` }

      return { warning: `No active employee matches "${name}"; the vehicle was left unassigned.` }
    }

    if (employeeNumber) return { warning: `No active employee has number ${employeeNumber}; the vehicle was left unassigned.` }

    return {}
  }

  const summary: FleetImportSummary = { dryRun, rows: [], created: 0, updated: 0, unchanged: 0, skipped: 0, unknownColumns: unknown }
  const seen = new Map<string, number>()

  for (let index = 1; index < table.length; index++) {
    const mapped = mapCsvRow(table[index], keys, index + 1)
    const matchKey = rowMatchKey(mapped)

    const label = [mapped.fields.unit_number && `Unit ${mapped.fields.unit_number}`, normalizeVin(mapped.fields.vin), mapped.fields.license_plate, [mapped.fields.year, mapped.fields.make, mapped.fields.model].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(' · ') || `Row ${index + 1}`

    const result: FleetImportRow = { line: index + 1, label, action: 'skip', vehicleId: null, changes: [], problems: [...mapped.problems], warnings: [...mapped.warnings] }

    summary.rows.push(result)

    if (matchKey && seen.has(matchKey)) result.problems.push(`Same vehicle as row ${seen.get(matchKey)}.`)
    if (matchKey) seen.set(matchKey, index + 1)

    const existing = matchKey ? byKey.get(matchKey) : null
    const { values, errors } = cleanVehicleInput(mapped.fields, { partial: Boolean(existing) })

    result.problems.push(...errors)

    // A VIN / unit number already used by a different vehicle than the one this row matched.
    if (existing) {
      const vin = normalizeVin(values.vin as string | null | undefined)
      const otherVin = vin ? byKey.get('vin:' + vin) : null
      const unit = values.unit_number ? byKey.get('unit:' + lower(values.unit_number)) : null

      if (otherVin && otherVin.id !== existing.id) result.problems.push(`VIN ${vin} belongs to ${otherVin.vehicle_number}.`)
      if (unit && unit.id !== existing.id) result.problems.push(`Unit number ${values.unit_number} belongs to ${unit.vehicle_number}.`)
      if (inScope && !inScope.includes(existing.id)) result.problems.push('This row matches a vehicle outside your access.')
    }

    const row: Record<string, unknown> = { ...values }

    if (present.has('location')) {
      const place = findPlace(locationsResult.data || [], mapped.location)

      if (place.missing) result.warnings.push(`Location "${mapped.location}" was not found; left blank.`)
      if (!place.missing || !existing) row.location_id = place.id
    }

    if (present.has('division')) {
      const place = findPlace(divisionsResult.data || [], mapped.division)

      if (place.missing) result.warnings.push(`Division "${mapped.division}" was not found; left blank.`)
      if (!place.missing || !existing) row.division_id = place.id
    }

    let driver: any = null

    if (present.has('driver') || present.has('driver_employee_number')) {
      const found = findDriver(mapped.driverEmployeeNumber, mapped.driverName)

      if (found.warning) result.warnings.push(found.warning)

      driver = found.person || null

      if (driver) row.assigned_driver_personnel_id = driver.id
      else if (!mapped.driverName && !mapped.driverEmployeeNumber) row.assigned_driver_personnel_id = null
    }

    if (mapped.status && (!existing || ['active', 'inactive'].includes(existing.status))) row.status = mapped.status

    const meters: { meter: 'mileage' | 'engine_hours'; value: number }[] = []

    for (const [meter, value, column, label_] of [
      ['mileage', mapped.mileage, 'mileage', 'Mileage'],
      ['engine_hours', mapped.engineHours, 'engine_hours', 'Engine hours']
    ] as const) {
      if (value == null) continue

      const rounded = meter === 'mileage' ? Math.round(value) : Math.round(value * 10) / 10
      const current = existing?.[column] == null ? null : Number(existing[column])

      if (current != null && rounded === current) continue

      if (current != null && rounded < current) {
        result.warnings.push(`${label_} ${rounded.toLocaleString('en-US')} is lower than the current ${current.toLocaleString('en-US')}; not recorded. Correct it on the vehicle page.`)
        continue
      }

      meters.push({ meter, value: rounded })
    }

    if (existing) {
      const changed = Object.keys(row).filter(column => String(row[column] ?? '') !== String(existing[column] ?? ''))

      result.vehicleId = existing.id
      result.changes = [...changed, ...meters.map(item => item.meter)]
      result.action = result.problems.length ? 'skip' : result.changes.length ? 'update' : 'unchanged'
    } else if (!result.problems.length) {
      const candidate = { organization_id: organizationId, location_id: (row.location_id as string) || null, division_id: (row.division_id as string) || null, assigned_driver_personnel_id: (row.assigned_driver_personnel_id as string) || null }

      if (!(await vehicleWithinScope({ organizationId, userId, scope, vehicle: candidate }))) result.problems.push('Set a location, division or driver within your access.')
      else result.action = 'create'
    }

    if (result.action === 'skip') summary.skipped++
    if (result.action === 'unchanged') summary.unchanged++

    if (result.action === 'skip' || result.action === 'unchanged' || dryRun) {
      if (result.action === 'create') summary.created++
      if (result.action === 'update') summary.updated++
      continue
    }

    let vehicleId: string

    if (result.action === 'update') {
      const patch = Object.fromEntries(result.changes.filter(column => column in row).map(column => [column, row[column]]))

      if (Object.keys(patch).length) {
        const { error } = await supabase.from('forge_fleet_vehicles').update({ ...patch, updated_by: userId }).eq('organization_id', organizationId).eq('id', existing.id)

        if (error) {
          result.action = 'skip'
          result.problems.push(vehicleDbMessage(error, 'Unable to update the vehicle.'))
          summary.skipped++
          continue
        }
      }

      vehicleId = existing.id
      summary.updated++
      await fleetActivity({ organizationId, vehicleId, actorUserId: userId, type: 'imported', message: `Updated by CSV import (${result.changes.length} field${result.changes.length === 1 ? '' : 's'}).`, metadata: { fields: result.changes } })
    } else {
      const { data: number, error: numberError } = await supabase.rpc('next_forge_fleet_number', { p_organization_id: organizationId, p_kind: 'vehicle' })

      if (numberError || !number) {
        result.action = 'skip'
        result.problems.push('Unable to number the vehicle.')
        summary.skipped++
        continue
      }

      const { data, error } = await supabase
        .from('forge_fleet_vehicles')
        .insert({ ...row, organization_id: organizationId, vehicle_number: number, status: row.status || 'active', source_system: 'forge-1.0-csv', created_by: userId, updated_by: userId })
        .select('*')
        .single()

      if (error || !data) {
        result.action = 'skip'
        result.problems.push(vehicleDbMessage(error, 'Unable to add the vehicle.'))
        summary.skipped++
        continue
      }

      vehicleId = data.id
      result.vehicleId = vehicleId
      summary.created++

      for (const matchKey_ of vehicleMatchKeys(data)) if (!byKey.has(matchKey_)) byKey.set(matchKey_, data)

      await fleetActivity({ organizationId, vehicleId, actorUserId: userId, type: 'imported', message: `Vehicle ${number} added by CSV import.` })
    }

    for (const reading of meters) {
      const { error } = await supabase.from('forge_fleet_meter_readings').insert({
        organization_id: organizationId,
        vehicle_id: vehicleId,
        meter: reading.meter,
        value: reading.value,
        source: 'import',
        notes: 'CSV import',
        recorded_by: userId
      })

      if (error) result.warnings.push(vehicleDbMessage(error, `Unable to record the ${reading.meter === 'mileage' ? 'mileage' : 'engine hours'}.`))
    }

    if (driver && !driver.is_company_driver) {
      await ensureCompanyDriver({ organizationId, personnelId: driver.id, actorUserId: userId })
      driver.is_company_driver = true
    }
  }

  if (!dryRun && (summary.created || summary.updated)) {
    await writeForgeAudit({
      actorUserId: userId,
      organizationId,
      action: 'fleet.vehicles_imported',
      entityType: 'fleet_import',
      entityId: organizationId,
      afterValue: { created: summary.created, updated: summary.updated, unchanged: summary.unchanged, skipped: summary.skipped }
    })
  }

  return summary
}
