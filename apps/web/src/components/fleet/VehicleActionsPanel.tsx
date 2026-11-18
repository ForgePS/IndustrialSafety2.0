'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { archiveVehicle, assignDriver, recordMeterReading, removeVehicle, restoreVehicle, setOutOfService } from '@/app/(back)/fleet/vehicleActions'

type Driver = { id: string; name: string; employeeNumber: string | null }

const inputClass = 'border-input bg-card mt-1 h-[38px] w-full rounded-md border px-3 text-sm'
const areaClass = 'border-input bg-card mt-1 min-h-16 w-full rounded-md border p-2 text-sm'

/**
 * Port slice 11: the vehicle page's actions: driver, mileage / engine hours, service status, removal.
 * Each section shows only when the viewer holds its permission; the server actions check again.
 */
const VehicleActionsPanel = ({
  vehicle,
  drivers,
  canEdit,
  canMeter,
  canRetire
}: {
  vehicle: { id: string; status: string; assignedDriverId: string | null; mileage: number | null; engineHours: number | null }
  drivers: Driver[]
  canEdit: boolean
  canMeter: boolean
  canRetire: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const removed = ['removed', 'sold', 'disposed'].includes(vehicle.status)

  const [driverId, setDriverId] = useState(vehicle.assignedDriverId || '')
  const [driverNote, setDriverNote] = useState('')
  const [meter, setMeter] = useState<'mileage' | 'engine_hours'>('mileage')
  const [reading, setReading] = useState('')
  const [correction, setCorrection] = useState(false)
  const [readingNote, setReadingNote] = useState('')
  const [meterError, setMeterError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [disposition, setDisposition] = useState('sold')
  const [dispositionDate, setDispositionDate] = useState(new Date().toISOString().slice(0, 10))
  const [dispositionNotes, setDispositionNotes] = useState('')

  const run = (action: () => Promise<{ error?: string; message?: string }>, after?: () => void, onError?: (message: string) => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)
        onError?.(result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      after?.()
      router.refresh()
    })

  if (!canEdit && !canMeter && !canRetire) return null

  return (
    <Card data-testid='vehicle-actions'>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        {canEdit && !removed ? (
          <section className='flex flex-col gap-2' data-testid='vehicle-driver-action'>
            <h3 className='font-semibold'>Driver</h3>
            <Label htmlFor='action-driver'>Assigned driver</Label>
            <select id='action-driver' className={inputClass} value={driverId} onChange={event => setDriverId(event.target.value)}>
              <option value=''>Unassigned</option>
              {drivers.map(driver => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                  {driver.employeeNumber ? ' · #' + driver.employeeNumber : ''}
                </option>
              ))}
            </select>
            <Label htmlFor='action-driver-note'>Note</Label>
            <textarea id='action-driver-note' className={areaClass} value={driverNote} onChange={event => setDriverNote(event.target.value)} />
            <div>
              <Button
                size='sm'
                disabled={pending || driverId === (vehicle.assignedDriverId || '')}
                onClick={() => run(() => assignDriver({ vehicleId: vehicle.id, personnelId: driverId || null, note: driverNote }), () => setDriverNote(''))}
              >
                {driverId ? 'Assign driver' : 'Unassign driver'}
              </Button>
            </div>
          </section>
        ) : null}

        {(canEdit || canMeter) && !removed ? (
          <section className='flex flex-col gap-2' data-testid='vehicle-meter-action'>
            <h3 className='font-semibold'>Record mileage or engine hours</h3>
            <p className='text-textSecondary text-xs'>
              Current: {vehicle.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') + ' mi' : 'no mileage'} ·{' '}
              {vehicle.engineHours != null ? Number(vehicle.engineHours).toLocaleString('en-US') + ' h' : 'no engine hours'}
            </p>
            <div className='grid grid-cols-2 gap-2'>
              <div>
                <Label htmlFor='action-meter'>Meter</Label>
                <select id='action-meter' className={inputClass} value={meter} onChange={event => setMeter(event.target.value as 'mileage' | 'engine_hours')}>
                  <option value='mileage'>Mileage</option>
                  <option value='engine_hours'>Engine hours</option>
                </select>
              </div>
              <div>
                <Label htmlFor='action-reading'>Reading</Label>
                <input id='action-reading' className={inputClass} inputMode='decimal' value={reading} onChange={event => setReading(event.target.value)} />
              </div>
            </div>
            <label className='flex items-center gap-2 text-sm'>
              <input type='checkbox' checked={correction} onChange={event => setCorrection(event.target.checked)} />
              This is a correction (meter replaced or the last reading was wrong)
            </label>
            <Label htmlFor='action-reading-note'>Note</Label>
            <input id='action-reading-note' className={inputClass} value={readingNote} onChange={event => setReadingNote(event.target.value)} />
            {meterError ? (
              <p className='text-destructive text-sm' role='alert' data-testid='meter-error'>
                {meterError}
              </p>
            ) : null}
            <div>
              <Button
                size='sm'
                disabled={pending || !reading.trim()}
                onClick={() => {
                  setMeterError(null)
                  run(
                    () => recordMeterReading({ vehicleId: vehicle.id, meter, value: reading, isCorrection: correction, notes: readingNote }),
                    () => {
                      setReading('')
                      setReadingNote('')
                      setCorrection(false)
                    },
                    setMeterError
                  )
                }}
              >
                Record reading
              </Button>
            </div>
          </section>
        ) : null}

        {canEdit && !removed ? (
          <section className='flex flex-col gap-2' data-testid='vehicle-service-action'>
            <h3 className='font-semibold'>Service status</h3>
            {vehicle.status === 'out_of_service' ? (
              <div>
                <Button size='sm' disabled={pending} onClick={() => run(() => setOutOfService({ vehicleId: vehicle.id, outOfService: false }))}>
                  Return to service
                </Button>
              </div>
            ) : (
              <>
                <Label htmlFor='action-oos-reason'>Reason</Label>
                <textarea id='action-oos-reason' className={areaClass} value={reason} onChange={event => setReason(event.target.value)} />
                <div>
                  <Button
                    size='sm'
                    variant='destructive'
                    disabled={pending || !reason.trim()}
                    onClick={() => run(() => setOutOfService({ vehicleId: vehicle.id, outOfService: true, reason }), () => setReason(''))}
                  >
                    Mark out of service
                  </Button>
                </div>
              </>
            )}
          </section>
        ) : null}

        {canRetire ? (
          <section className='flex flex-col gap-2' data-testid='vehicle-retire-action'>
            <h3 className='font-semibold'>{removed ? 'Removed from the fleet' : 'Remove from the fleet'}</h3>
            {removed ? (
              <div className='flex flex-wrap gap-2'>
                <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => restoreVehicle({ vehicleId: vehicle.id }))}>
                  Restore as inactive
                </Button>
                <Button
                  size='sm'
                  variant='destructive'
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm('Archive this vehicle? It will be hidden from every list.')) run(() => archiveVehicle({ vehicleId: vehicle.id }), () => router.push('/fleet/removed'))
                  }}
                >
                  Archive
                </Button>
              </div>
            ) : (
              <>
                <div className='grid grid-cols-2 gap-2'>
                  <div>
                    <Label htmlFor='action-disposition'>Disposition</Label>
                    <select id='action-disposition' className={inputClass} value={disposition} onChange={event => setDisposition(event.target.value)}>
                      <option value='sold'>Sold</option>
                      <option value='disposed'>Disposed</option>
                      <option value='removed'>Removed</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor='action-disposition-date'>Date</Label>
                    <input id='action-disposition-date' type='date' className={inputClass} value={dispositionDate} onChange={event => setDispositionDate(event.target.value)} />
                  </div>
                </div>
                <Label htmlFor='action-disposition-notes'>Notes</Label>
                <textarea id='action-disposition-notes' className={areaClass} value={dispositionNotes} onChange={event => setDispositionNotes(event.target.value)} />
                <div>
                  <Button
                    size='sm'
                    variant='destructive'
                    disabled={pending}
                    onClick={() => run(() => removeVehicle({ vehicleId: vehicle.id, disposition, date: dispositionDate, notes: dispositionNotes }))}
                  >
                    Remove from fleet
                  </Button>
                </div>
              </>
            )}
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default VehicleActionsPanel
