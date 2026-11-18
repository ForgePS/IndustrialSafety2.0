/**
 * Port slice 11: vehicle field rules shared by the vehicle form, the CSV import and the CSV reports.
 * Pure: no database, no Next. Unit tests: tests/port-s11-vehicles.test.cjs.
 *
 * The import reads 1.0's industrial.fleet.v1 template (packages/imports/src/templates.ts) and our own
 * inventory export, matching headers loosely (case, spaces and punctuation ignored).
 */
import {
  COMMUTE_STATUSES,
  COMMUTE_STATUS_LABELS,
  COUNTY_STATUSES,
  COUNTY_STATUS_LABELS,
  FILING_STATUSES,
  FILING_STATUS_LABELS,
  INSURANCE_STATUSES,
  INSURANCE_STATUS_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  normalizeVin
} from './forgeFleetRules.ts'

// ---------------------------------------------------------------------------
// Vehicle fields
// ---------------------------------------------------------------------------

export type VehicleFieldKind = 'text' | 'long' | 'int' | 'decimal' | 'date' | 'bool' | 'enum' | 'month' | 'state' | 'email' | 'vin'

export type VehicleField = {
  key: string
  label: string
  group: 'Identity' | 'Registration' | 'DOT' | 'Insurance' | 'Tax & filings' | 'Notes'
  kind: VehicleFieldKind
  options?: readonly string[]
  labels?: Record<string, string>
  defaultValue?: string | boolean
  min?: number
  max?: number
}

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) => ({ options: values, labels: labels as Record<string, string> })

/** Editable vehicle columns, in form order. Location, division, driver and status are handled separately. */
export const VEHICLE_FIELDS: VehicleField[] = [
  { key: 'unit_number', label: 'Unit number', group: 'Identity', kind: 'text' },
  { key: 'vehicle_type', label: 'Type', group: 'Identity', kind: 'enum', ...opts(VEHICLE_TYPES, VEHICLE_TYPE_LABELS), defaultValue: 'fleet_vehicle' },
  { key: 'custom_type_label', label: 'Custom type label', group: 'Identity', kind: 'text' },
  { key: 'year', label: 'Year', group: 'Identity', kind: 'int', min: 1900, max: 2100 },
  { key: 'make', label: 'Make', group: 'Identity', kind: 'text' },
  { key: 'model', label: 'Model', group: 'Identity', kind: 'text' },
  { key: 'trim', label: 'Trim', group: 'Identity', kind: 'text' },
  { key: 'color', label: 'Color', group: 'Identity', kind: 'text' },
  { key: 'vin', label: 'VIN', group: 'Identity', kind: 'vin' },
  { key: 'serial_number', label: 'Serial number', group: 'Identity', kind: 'text' },
  { key: 'license_plate', label: 'License plate', group: 'Registration', kind: 'text' },
  { key: 'license_state', label: 'License state', group: 'Registration', kind: 'state' },
  { key: 'registration_renewal_date', label: 'Registration renewal date', group: 'Registration', kind: 'date' },
  { key: 'registration_renewal_month', label: 'Registration renewal month', group: 'Registration', kind: 'month' },
  { key: 'dot_regulated', label: 'DOT regulated', group: 'DOT', kind: 'bool', defaultValue: false },
  { key: 'gvwr_lbs', label: 'GVWR (lbs)', group: 'DOT', kind: 'int', min: 1, max: 1000000 },
  { key: 'annual_inspection_due_on', label: 'Annual inspection due', group: 'DOT', kind: 'date' },
  { key: 'insurance_status', label: 'Insurance status', group: 'Insurance', kind: 'enum', ...opts(INSURANCE_STATUSES, INSURANCE_STATUS_LABELS), defaultValue: 'unknown' },
  { key: 'insurance_company', label: 'Insurance company', group: 'Insurance', kind: 'text' },
  { key: 'insurance_policy_number', label: 'Policy number', group: 'Insurance', kind: 'text' },
  { key: 'insurance_phone', label: 'Insurance company phone', group: 'Insurance', kind: 'text' },
  { key: 'insurance_agent_name', label: 'Agent name', group: 'Insurance', kind: 'text' },
  { key: 'insurance_agent_phone', label: 'Agent phone', group: 'Insurance', kind: 'text' },
  { key: 'insurance_agent_email', label: 'Agent email', group: 'Insurance', kind: 'email' },
  { key: 'insurance_effective_on', label: 'Insurance effective', group: 'Insurance', kind: 'date' },
  { key: 'insurance_expires_on', label: 'Insurance expires', group: 'Insurance', kind: 'date' },
  { key: 'county_assessment_status', label: 'County assessment', group: 'Tax & filings', kind: 'enum', ...opts(COUNTY_STATUSES, COUNTY_STATUS_LABELS), defaultValue: 'unknown' },
  { key: 'county_assessment_notes', label: 'County assessment notes', group: 'Tax & filings', kind: 'text' },
  { key: 'commute_use_status', label: 'Commute use', group: 'Tax & filings', kind: 'enum', ...opts(COMMUTE_STATUSES, COMMUTE_STATUS_LABELS), defaultValue: 'unknown' },
  { key: 'commute_use_notes', label: 'Commute use notes', group: 'Tax & filings', kind: 'text' },
  { key: 'vehicle_fringe', label: 'Not on vehicle fringe SS', group: 'Tax & filings', kind: 'bool', defaultValue: false },
  { key: 'form_2290_status', label: 'Form 2290', group: 'Tax & filings', kind: 'enum', ...opts(FILING_STATUSES, FILING_STATUS_LABELS), defaultValue: 'unknown' },
  { key: 'form_2290_notes', label: 'Form 2290 notes', group: 'Tax & filings', kind: 'text' },
  { key: 'irp_status', label: 'IRP', group: 'Tax & filings', kind: 'enum', ...opts(FILING_STATUSES, FILING_STATUS_LABELS), defaultValue: 'unknown' },
  { key: 'irp_notes', label: 'IRP notes', group: 'Tax & filings', kind: 'text' },
  { key: 'notes', label: 'Notes', group: 'Notes', kind: 'long' }
]

export const VEHICLE_FIELD_BY_KEY = new Map(VEHICLE_FIELDS.map(field => [field.key, field]))

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const isIsoDate = (value: string) => {
  if (!ISO_DATE.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const truthy = (value: unknown) => value === true || ['true', 'on', 'yes', 'y', '1'].includes(String(value ?? '').trim().toLowerCase())

/**
 * Validates raw vehicle field values (strings from a form or a mapped CSV row). With `partial`, only keys
 * present in `raw` are returned (an import updates only the columns in the file).
 */
export const cleanVehicleInput = (raw: Record<string, unknown>, { partial = false }: { partial?: boolean } = {}) => {
  const values: Record<string, string | number | boolean | null> = {}
  const errors: string[] = []

  for (const field of VEHICLE_FIELDS) {
    if (partial && !(field.key in raw)) continue

    const input = raw[field.key]
    const text = typeof input === 'string' ? input.trim() : input == null ? '' : String(input).trim()

    switch (field.kind) {
      case 'bool':
        values[field.key] = input === undefined || input === null || input === '' ? Boolean(field.defaultValue) : truthy(input)
        break
      case 'enum':
        if (!text) values[field.key] = (field.defaultValue as string) ?? null
        else if (field.options?.includes(text)) values[field.key] = text
        else errors.push(`${field.label}: "${text}" is not a valid choice.`)
        break
      case 'int':

      case 'month': {
        if (!text) {
          values[field.key] = null
          break
        }

        const number = Number(text.replace(/,/g, ''))
        const min = field.kind === 'month' ? 1 : (field.min ?? 0)
        const max = field.kind === 'month' ? 12 : (field.max ?? Number.MAX_SAFE_INTEGER)

        if (!Number.isInteger(number) || number < min || number > max) errors.push(`${field.label} must be a whole number from ${min} to ${max}.`)
        else values[field.key] = number
        break
      }

      case 'decimal': {
        const number = Number(text.replace(/,/g, ''))

        if (!text) values[field.key] = null
        else if (!Number.isFinite(number) || number < 0) errors.push(`${field.label} must be a number.`)
        else values[field.key] = number
        break
      }

      case 'date':
        if (!text) values[field.key] = null
        else if (isIsoDate(text)) values[field.key] = text
        else errors.push(`${field.label} must be a date (YYYY-MM-DD).`)
        break
      case 'state':
        if (!text) values[field.key] = null
        else if (/^[A-Za-z]{2}$/.test(text)) values[field.key] = text.toUpperCase()
        else errors.push(`${field.label} must be a two-letter state code.`)
        break
      case 'email':
        if (!text) values[field.key] = null
        else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 200) values[field.key] = text
        else errors.push(`${field.label} is not a valid email address.`)
        break
      case 'vin':
        values[field.key] = normalizeVin(text)
        if (text.length > 40) errors.push('VIN is too long.')
        break
      case 'long':
        if (text.length > 4000) errors.push(`${field.label} must be 4,000 characters or fewer.`)
        else values[field.key] = text || null
        break
      default:
        if (text.length > 200) errors.push(`${field.label} must be 200 characters or fewer.`)
        else values[field.key] = text || null
    }
  }

  const effective = values.insurance_effective_on
  const expires = values.insurance_expires_on

  if (typeof effective === 'string' && typeof expires === 'string' && expires < effective) errors.push('Insurance expires before it takes effect.')

  return { values, errors }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, a leading BOM. Blank lines are dropped. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const input = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += char
      continue
    }

    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }

  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter(line => line.some(value => value.trim() !== ''))
}

/** Undo the export's formula guard ("'=..." back to "=..."). */
const unguard = (value: string) => (/^'[=+\-@]/.test(value) ? value.slice(1) : value)

const headerToken = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '')

/** CSV column → import key. Vehicle field keys, plus location / division / driver / mileage / status. */
const HEADER_ALIASES: Record<string, string> = {
  // 1.0 industrial.fleet.v1
  year: 'year',
  make: 'make',
  model: 'model',
  color: 'color',
  vinnumber: 'vin',
  license: 'license_plate',
  renewaldate: 'registration_renewal_date',
  location: 'location',
  assigneddriver: 'driver',
  countyassessed: 'county_assessment_status',
  insured: 'insurance_status',
  mileage: 'mileage',
  notes: 'notes',
  notonvehiclefringess: 'vehicle_fringe',
  assettype: 'vehicle_type',
  form2290: 'form_2290_status',
  irp: 'irp_status',
  commuteuse: 'commute_use_status',
  registrationrenewalmonth: 'registration_renewal_month',

  // Our inventory export and common variants
  vehicle: 'vehicle_number',
  vehiclenumber: 'vehicle_number',
  unit: 'unit_number',
  unitnumber: 'unit_number',
  asset: 'unit_number',
  assetnumber: 'unit_number',
  type: 'vehicle_type',
  vehicletype: 'vehicle_type',
  customtype: 'custom_type_label',
  customtypelabel: 'custom_type_label',
  trim: 'trim',
  vin: 'vin',
  serial: 'serial_number',
  serialnumber: 'serial_number',
  status: 'status',
  outofservicereason: 'ignore',
  licenseplate: 'license_plate',
  plate: 'license_plate',
  licensestate: 'license_state',
  registrationrenewaldate: 'registration_renewal_date',
  renewalmonth: 'registration_renewal_month',
  division: 'division',
  driver: 'driver',
  driveremployee: 'driver_employee_number',
  driveremployeenumber: 'driver_employee_number',
  dotregulated: 'dot_regulated',
  gvwr: 'gvwr_lbs',
  gvwrlbs: 'gvwr_lbs',
  annualinspectiondue: 'annual_inspection_due_on',
  enginehours: 'engine_hours',
  insurancestatus: 'insurance_status',
  insurancecompany: 'insurance_company',
  policy: 'insurance_policy_number',
  policynumber: 'insurance_policy_number',
  insurancepolicynumber: 'insurance_policy_number',
  insurancephone: 'insurance_phone',
  insurancecompanyphone: 'insurance_phone',
  agentname: 'insurance_agent_name',
  agentphone: 'insurance_agent_phone',
  agentemail: 'insurance_agent_email',
  insuranceeffective: 'insurance_effective_on',
  insuranceexpires: 'insurance_expires_on',
  countyassessment: 'county_assessment_status',
  countyassessmentnotes: 'county_assessment_notes',
  commuteusenotes: 'commute_use_notes',
  vehiclefringe: 'vehicle_fringe',
  form2290notes: 'form_2290_notes',
  irpnotes: 'irp_notes',
  disposition: 'ignore',
  dispositiondate: 'ignore',
  dispositionnotes: 'ignore'
}

/** 1.0's industrial.fleet.v1 headers, in template order, plus Unit Number so re-imports can match. */
export const FLEET_TEMPLATE_HEADERS = [
  'Year',
  'Make',
  'Model',
  'Color',
  'VIN Number',
  'License',
  'Renewal Date',
  'Location',
  'Assigned Driver',
  'County Assessed',
  'Insured',
  'Mileage',
  'Notes',
  'Not on Vehicle Fringe SS',
  'Asset Type',
  'Form 2290',
  'IRP',
  'Commute Use',
  'Registration Renewal Month',
  'Unit Number'
]

export const mapCsvHeaders = (headers: string[]) => {
  const keys = headers.map(header => HEADER_ALIASES[headerToken(header)] ?? null)
  const unknown = headers.filter((header, index) => header.trim() && !keys[index])

  return { keys, unknown }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "2026-03-01", "3/1/2026", "3/1/26" → ISO date; null when not a date. */
export const parseDateText = (value: string): string | null => {
  const text = value.trim()

  if (!text) return null
  if (isIsoDate(text)) return text
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && isIsoDate(text.slice(0, 10))) return text.slice(0, 10)

  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)

  if (!us) return null

  const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3])
  const iso = `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`

  return isIsoDate(iso) ? iso : null
}

export const parseMonthText = (value: string): number | null => {
  const text = value.trim().toLowerCase()

  if (!text) return null
  if (/^\d{1,2}$/.test(text)) return Number(text) >= 1 && Number(text) <= 12 ? Number(text) : null

  const index = MONTHS.indexOf(text.slice(0, 3))

  return index >= 0 ? index + 1 : null
}

const key = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/** Text → one of the enum values, by value or label (case-insensitive), with extra aliases. */
const enumFromText = (text: string, values: readonly string[], labels: Record<string, string>, aliases: Record<string, string> = {}) => {
  const token = key(text)

  if (!token) return ''
  if (values.includes(token)) return token
  if (aliases[token]) return aliases[token]

  return values.find(value => key(labels[value] || '') === token) ?? null
}

const YES_NO_FILING: Record<string, string> = { yes: 'filed', y: 'filed', no: 'not_required', n: 'not_required', n_a: 'not_required', na: 'not_required' }

/** CSV text → the canonical value cleanVehicleInput expects, or null when it can't be read. */
const CONVERTERS: Record<string, (text: string) => string | null> = {
  vehicle_type: text => enumFromText(text, VEHICLE_TYPES, VEHICLE_TYPE_LABELS, { bobtail_truck: 'bob_truck', bob_tail: 'bob_truck', tractor: 'tractor_truck', equipment: 'construction_equipment', truck: 'fleet_vehicle', car: 'passenger_vehicle' }),
  insurance_status: text => enumFromText(text, INSURANCE_STATUSES, INSURANCE_STATUS_LABELS, { yes: 'insured', y: 'insured', true: 'insured', no: 'not_insured', n: 'not_insured', false: 'not_insured' }),
  county_assessment_status: text => enumFromText(text, COUNTY_STATUSES, COUNTY_STATUS_LABELS, { yes: 'assessed', y: 'assessed', no: 'not_assessed', n: 'not_assessed' }),
  commute_use_status: text => enumFromText(text, COMMUTE_STATUSES, COMMUTE_STATUS_LABELS, { y: 'yes', n: 'no' }),
  form_2290_status: text => enumFromText(text, FILING_STATUSES, FILING_STATUS_LABELS, YES_NO_FILING),
  irp_status: text => enumFromText(text, FILING_STATUSES, FILING_STATUS_LABELS, YES_NO_FILING),
  registration_renewal_date: parseDateText,
  annual_inspection_due_on: parseDateText,
  insurance_effective_on: parseDateText,
  insurance_expires_on: parseDateText,
  registration_renewal_month: text => {
    const month = parseMonthText(text)

    return month ? String(month) : null
  },
  dot_regulated: text => (['yes', 'y', 'true', '1', 'no', 'n', 'false', '0'].includes(key(text)) ? String(truthy(text)) : null),
  vehicle_fringe: text => (['yes', 'y', 'true', '1', 'x', 'no', 'n', 'false', '0'].includes(key(text)) ? String(truthy(text) || key(text) === 'x') : null)
}

/** Where an unreadable value is kept so nothing in the file is lost. */
const NOTES_FOR: Record<string, string> = {
  county_assessment_status: 'county_assessment_notes',
  commute_use_status: 'commute_use_notes',
  form_2290_status: 'form_2290_notes',
  irp_status: 'irp_notes'
}

export type MappedVehicleRow = {
  line: number
  fields: Record<string, string>
  location: string | null
  division: string | null
  driverName: string | null
  driverEmployeeNumber: string | null
  mileage: number | null
  engineHours: number | null
  status: 'active' | 'inactive' | null
  problems: string[]
  warnings: string[]
}

const readNumber = (text: string, label: string, problems: string[]) => {
  const clean = text.replace(/[, ]/g, '').replace(/(mi|miles|hrs|hours)$/i, '')

  if (!clean) return null

  const number = Number(clean)

  if (!Number.isFinite(number) || number < 0) {
    problems.push(`${label} "${text}" is not a number.`)

    return null
  }

  return number
}

/** One CSV row → vehicle field strings plus the parts the server resolves (location, driver, meters). */
export const mapCsvRow = (cells: string[], keys: (string | null)[], line: number): MappedVehicleRow => {
  const row: MappedVehicleRow = {
    line,
    fields: {},
    location: null,
    division: null,
    driverName: null,
    driverEmployeeNumber: null,
    mileage: null,
    engineHours: null,
    status: null,
    problems: [],
    warnings: []
  }

  keys.forEach((column, index) => {
    if (!column || column === 'ignore' || column === 'vehicle_number') return

    const text = unguard((cells[index] ?? '').trim())

    if (column === 'location') row.location = text || null
    else if (column === 'division') row.division = text || null
    else if (column === 'driver') row.driverName = text || null
    else if (column === 'driver_employee_number') row.driverEmployeeNumber = text || null
    else if (column === 'mileage') row.mileage = readNumber(text, 'Mileage', row.problems)
    else if (column === 'engine_hours') row.engineHours = readNumber(text, 'Engine hours', row.problems)
    else if (column === 'status') {
      const status = enumFromText(text, ['active', 'inactive', 'out_of_service', 'removed', 'sold', 'disposed'], VEHICLE_STATUS_LABELS, { in_service: 'active' })

      if (status === 'active' || status === 'inactive') row.status = status
      else if (status) row.warnings.push(`Status "${text}" is not imported; use the vehicle page to take a unit out of service or remove it.`)
    } else if (CONVERTERS[column]) {
      if (!text) {
        row.fields[column] = ''

        return
      }

      const value = CONVERTERS[column](text)

      if (value === null) {
        const label = VEHICLE_FIELD_BY_KEY.get(column)?.label || column
        const notes = NOTES_FOR[column]

        if (notes) {
          row.warnings.push(`${label} "${text}" was not recognised; kept in ${VEHICLE_FIELD_BY_KEY.get(notes)?.label}.`)
          row.fields[notes] = [row.fields[notes], text].filter(Boolean).join('; ')
        } else if (column === 'vehicle_type') {
          row.fields.vehicle_type = 'other'
          row.fields.custom_type_label = text
        } else row.problems.push(`${label} "${text}" could not be read.`)
      } else row.fields[column] = value
    } else if (column === 'year') {
      row.fields.year = text.replace(/\.0+$/, '')
    } else if (column === 'gvwr_lbs') {
      row.fields.gvwr_lbs = text.replace(/[, ]|lbs?$/gi, '')
    } else if (Object.values(NOTES_FOR).includes(column)) {
      row.fields[column] = [text, row.fields[column]].filter(Boolean).join('; ')
    } else row.fields[column] = text
  })

  // 1.0 accepted make/model alone, which duplicated the vehicle on every re-import.
  if (!row.fields.vin && !row.fields.unit_number && !row.fields.license_plate) row.problems.push('Each row needs a VIN, unit number or license plate.')

  return row
}

/** The key a row matches an existing vehicle by: VIN, else unit number, else license plate. */
export const rowMatchKey = (row: Pick<MappedVehicleRow, 'fields'>) => {
  const vin = normalizeVin(row.fields.vin)

  if (vin) return 'vin:' + vin
  if (row.fields.unit_number?.trim()) return 'unit:' + row.fields.unit_number.trim().toLowerCase()
  if (row.fields.license_plate?.trim()) return 'plate:' + row.fields.license_plate.replace(/\s/g, '').toUpperCase()

  return null
}

/** The same keys for a stored vehicle. */
export const vehicleMatchKeys = (vehicle: { vin?: string | null; unit_number?: string | null; license_plate?: string | null }) =>
  [
    vehicle.vin ? 'vin:' + normalizeVin(vehicle.vin) : null,
    vehicle.unit_number ? 'unit:' + vehicle.unit_number.trim().toLowerCase() : null,
    vehicle.license_plate ? 'plate:' + vehicle.license_plate.replace(/\s/g, '').toUpperCase() : null
  ].filter(Boolean) as string[]

// ---------------------------------------------------------------------------
// CSV reports
// ---------------------------------------------------------------------------

export type ReportVehicle = Record<string, any> & {
  locations?: { name?: string | null } | null
  divisions?: { name?: string | null } | null
  driver?: { first_name?: string | null; last_name?: string | null; employee_number?: string | null } | null
}

const yesNo = (value: unknown) => (value ? 'Yes' : 'No')
const label = (field: string) => (value: unknown) => VEHICLE_FIELD_BY_KEY.get(field)?.labels?.[String(value)] ?? (value == null ? '' : String(value))
const plain = (column: string) => (vehicle: ReportVehicle) => vehicle[column] ?? ''

/** Inventory columns (header, value). The import reads these headers back. */
export const INVENTORY_COLUMNS: [string, (vehicle: ReportVehicle) => unknown][] = [
  ['Vehicle #', plain('vehicle_number')],
  ['Unit Number', plain('unit_number')],
  ['Type', vehicle => label('vehicle_type')(vehicle.vehicle_type)],
  ['Custom Type', plain('custom_type_label')],
  ['Year', plain('year')],
  ['Make', plain('make')],
  ['Model', plain('model')],
  ['Trim', plain('trim')],
  ['Color', plain('color')],
  ['VIN', plain('vin')],
  ['Serial Number', plain('serial_number')],
  ['Status', vehicle => VEHICLE_STATUS_LABELS[vehicle.status as keyof typeof VEHICLE_STATUS_LABELS] ?? vehicle.status],
  ['Out of Service Reason', plain('out_of_service_reason')],
  ['License Plate', plain('license_plate')],
  ['License State', plain('license_state')],
  ['Registration Renewal Date', plain('registration_renewal_date')],
  ['Registration Renewal Month', plain('registration_renewal_month')],
  ['Location', vehicle => vehicle.locations?.name ?? ''],
  ['Division', vehicle => vehicle.divisions?.name ?? ''],
  ['Driver', vehicle => (vehicle.driver ? `${vehicle.driver.first_name ?? ''} ${vehicle.driver.last_name ?? ''}`.trim() : '')],
  ['Driver Employee Number', vehicle => vehicle.driver?.employee_number ?? ''],
  ['DOT Regulated', vehicle => yesNo(vehicle.dot_regulated)],
  ['GVWR (lbs)', plain('gvwr_lbs')],
  ['Mileage', plain('mileage')],
  ['Engine Hours', plain('engine_hours')],
  ['Annual Inspection Due', plain('annual_inspection_due_on')],
  ['Insurance Status', vehicle => label('insurance_status')(vehicle.insurance_status)],
  ['Insurance Company', plain('insurance_company')],
  ['Policy Number', plain('insurance_policy_number')],
  ['Insurance Phone', plain('insurance_phone')],
  ['Agent Name', plain('insurance_agent_name')],
  ['Agent Phone', plain('insurance_agent_phone')],
  ['Agent Email', plain('insurance_agent_email')],
  ['Insurance Effective', plain('insurance_effective_on')],
  ['Insurance Expires', plain('insurance_expires_on')],
  ['County Assessment', vehicle => label('county_assessment_status')(vehicle.county_assessment_status)],
  ['County Assessment Notes', plain('county_assessment_notes')],
  ['Commute Use', vehicle => label('commute_use_status')(vehicle.commute_use_status)],
  ['Commute Use Notes', plain('commute_use_notes')],
  ['Vehicle Fringe', vehicle => yesNo(vehicle.vehicle_fringe)],
  ['Form 2290', vehicle => label('form_2290_status')(vehicle.form_2290_status)],
  ['Form 2290 Notes', plain('form_2290_notes')],
  ['IRP', vehicle => label('irp_status')(vehicle.irp_status)],
  ['IRP Notes', plain('irp_notes')],
  ['Notes', plain('notes')]
]

export const REMOVED_COLUMNS: [string, (vehicle: ReportVehicle) => unknown][] = [
  ...INVENTORY_COLUMNS.filter(([header]) => !['Out of Service Reason', 'Driver', 'Driver Employee Number'].includes(header)),
  ['Disposition', vehicle => VEHICLE_STATUS_LABELS[vehicle.status as keyof typeof VEHICLE_STATUS_LABELS] ?? vehicle.status],
  ['Disposition Date', plain('disposition_date')],
  ['Disposition Notes', plain('disposition_notes')]
]
