'use client'

import { useMemo, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { saveVehicle } from '@/app/(back)/fleet/vehicleActions'
import { VEHICLE_FIELDS, type VehicleField } from '@/lib/forgeFleetImportRules'
import { vinWarning } from '@/lib/forgeFleetRules'

type Option = { id: string; name: string; employeeNumber?: string | null }

const inputClass = 'border-input bg-card mt-1 h-[38px] w-full rounded-md border px-3 text-sm'

const GROUPS: { key: VehicleField['group'] | 'Assignment'; title: string }[] = [
  { key: 'Identity', title: 'Identity' },
  { key: 'Registration', title: 'Registration' },
  { key: 'Assignment', title: 'Assignment' },
  { key: 'DOT', title: 'DOT' },
  { key: 'Insurance', title: 'Insurance' },
  { key: 'Tax & filings', title: 'Tax & filings' },
  { key: 'Notes', title: 'Notes' }
]

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const initialValue = (field: VehicleField, vehicle: Record<string, any> | null) => {
  const value = vehicle?.[field.key]

  if (field.kind === 'bool') return Boolean(value ?? field.defaultValue)
  if (value == null) return (field.defaultValue as string) ?? ''

  return String(value)
}

/** Port slice 11: create / edit a vehicle. Every column, grouped as on 1.0's vehicle form. */
const VehicleForm = ({
  vehicle,
  drivers,
  locations,
  divisions
}: {
  vehicle: Record<string, any> | null
  drivers: Option[]
  locations: Option[]
  divisions: Option[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fields, setFields] = useState<Record<string, string | boolean>>(() => Object.fromEntries(VEHICLE_FIELDS.map(field => [field.key, initialValue(field, vehicle)])))
  const [locationId, setLocationId] = useState<string>(vehicle?.location_id || '')
  const [divisionId, setDivisionId] = useState<string>(vehicle?.division_id || '')
  const [driverId, setDriverId] = useState<string>(vehicle?.assigned_driver_personnel_id || '')
  const [status, setStatus] = useState<string>(vehicle?.status === 'inactive' ? 'inactive' : 'active')
  const [mileage, setMileage] = useState('')
  const [engineHours, setEngineHours] = useState('')
  const [error, setError] = useState<string | null>(null)

  const warning = useMemo(() => vinWarning(String(fields.vin || '')), [fields.vin])
  const statusEditable = !vehicle || vehicle.status === 'active' || vehicle.status === 'inactive'

  // A driver who has since left stays selectable on the record that already names them.
  const driverOptions = useMemo((): Option[] => {
    if (vehicle?.driver && !drivers.some(driver => driver.id === vehicle.driver.id)) {
      return [{ id: vehicle.driver.id, name: `${vehicle.driver.first_name} ${vehicle.driver.last_name} (no longer active)` }, ...drivers]
    }

    return drivers
  }, [drivers, vehicle])

  const set = (key: string, value: string | boolean) => setFields(current => ({ ...current, [key]: value }))

  const renderField = (field: VehicleField) => {
    const id = 'vehicle-' + field.key
    const value = fields[field.key]

    if (field.key === 'custom_type_label' && fields.vehicle_type !== 'other') return null

    if (field.kind === 'bool') {
      return (
        <label key={field.key} className='flex items-center gap-2 pt-6 text-sm'>
          <input id={id} type='checkbox' checked={Boolean(value)} onChange={event => set(field.key, event.target.checked)} />
          {field.label}
        </label>
      )
    }

    let control: React.ReactNode

    if (field.kind === 'enum') {
      control = (
        <select id={id} className={inputClass} value={String(value)} onChange={event => set(field.key, event.target.value)}>
          {field.options?.map(option => (
            <option key={option} value={option}>
              {field.labels?.[option] || option}
            </option>
          ))}
        </select>
      )
    } else if (field.kind === 'month') {
      control = (
        <select id={id} className={inputClass} value={String(value)} onChange={event => set(field.key, event.target.value)}>
          <option value=''>Not set</option>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={String(index + 1)}>
              {name}
            </option>
          ))}
        </select>
      )
    } else if (field.kind === 'long') {
      control = <textarea id={id} className='border-input bg-card mt-1 min-h-24 w-full rounded-md border p-3 text-sm' value={String(value)} onChange={event => set(field.key, event.target.value)} />
    } else {
      control = (
        <input
          id={id}
          className={inputClass + (field.kind === 'vin' ? ' font-mono uppercase' : '')}
          type={field.kind === 'date' ? 'date' : field.kind === 'int' ? 'number' : field.kind === 'email' ? 'email' : 'text'}
          maxLength={field.kind === 'state' ? 2 : field.kind === 'vin' ? 40 : 200}
          value={String(value)}
          onChange={event => set(field.key, event.target.value)}
        />
      )
    }

    return (
      <div key={field.key} className={field.kind === 'long' ? 'md:col-span-2 xl:col-span-3' : ''}>
        <Label htmlFor={id}>{field.label}</Label>
        {control}
        {field.kind === 'vin' && warning ? (
          <p className='mt-1 text-xs text-amber-700 dark:text-amber-300' data-testid='vin-warning'>
            {warning} You can still save it.
          </p>
        ) : null}
      </div>
    )
  }

  const submit = () =>
    startTransition(async () => {
      setError(null)

      const result = await saveVehicle({
        id: vehicle?.id || null,
        fields,
        locationId: locationId || null,
        divisionId: divisionId || null,
        driverId: driverId || null,
        status: statusEditable ? (status as 'active' | 'inactive') : null,
        initialMileage: vehicle ? null : mileage,
        initialEngineHours: vehicle ? null : engineHours
      })

      if (result.error) {
        setError(result.error)
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      if (result.warning) toast('warning', 'VIN: ' + result.warning)
      router.push('/fleet/vehicles/' + result.id)
      router.refresh()
    })

  return (
    <form
      className='flex flex-col gap-6'
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      {GROUPS.map(group => (
        <Card key={group.key}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {group.key === 'Assignment' ? (
              <>
                <div>
                  <Label htmlFor='vehicle-location'>Location</Label>
                  <select id='vehicle-location' className={inputClass} value={locationId} onChange={event => setLocationId(event.target.value)}>
                    <option value=''>No location</option>
                    {locations.map(location => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor='vehicle-division'>Division</Label>
                  <select id='vehicle-division' className={inputClass} value={divisionId} onChange={event => setDivisionId(event.target.value)}>
                    <option value=''>No division</option>
                    {divisions.map(division => (
                      <option key={division.id} value={division.id}>
                        {division.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor='vehicle-driver'>Assigned driver</Label>
                  <select id='vehicle-driver' className={inputClass} value={driverId} onChange={event => setDriverId(event.target.value)}>
                    <option value=''>Unassigned</option>
                    {driverOptions.map(driver => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}
                        {driver.employeeNumber ? ' · #' + driver.employeeNumber : ''}
                      </option>
                    ))}
                  </select>
                  <p className='text-textSecondary mt-1 text-xs'>Drivers are added to the DOT company-driver roster.</p>
                </div>
                {statusEditable ? (
                  <div>
                    <Label htmlFor='vehicle-status'>Status</Label>
                    <select id='vehicle-status' className={inputClass} value={status} onChange={event => setStatus(event.target.value)}>
                      <option value='active'>In service</option>
                      <option value='inactive'>Inactive</option>
                    </select>
                  </div>
                ) : null}
                {!vehicle ? (
                  <>
                    <div>
                      <Label htmlFor='vehicle-mileage'>Current mileage</Label>
                      <input id='vehicle-mileage' className={inputClass} inputMode='numeric' value={mileage} onChange={event => setMileage(event.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor='vehicle-engine-hours'>Current engine hours</Label>
                      <input id='vehicle-engine-hours' className={inputClass} inputMode='decimal' value={engineHours} onChange={event => setEngineHours(event.target.value)} />
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              VEHICLE_FIELDS.filter(field => field.group === group.key).map(renderField)
            )}
          </CardContent>
        </Card>
      ))}

      {error ? (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      ) : null}

      <div className='flex gap-3'>
        <Button type='submit' disabled={pending}>
          {pending ? 'Saving...' : vehicle ? 'Save vehicle' : 'Add vehicle'}
        </Button>
        <Button type='button' variant='outline' onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default VehicleForm
