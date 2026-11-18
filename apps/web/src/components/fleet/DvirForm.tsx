'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbChecks } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import SignaturePad from '@/components/common/SignaturePad'
import DvirScanResult from '@/components/fleet/DvirScanResult'
import type { DvirAnswer, DvirSection, DvirTripType } from '@/lib/forgeFleetRules'
import { DVIR_ITEMS, DVIR_SECTION_LABELS, DVIR_TRIP_LABELS, DVIR_TRIP_TYPES } from '@/lib/forgeFleetRules'
import type { DvirDraftAnswers } from '@/lib/forgeFleetDvirRules'
import { markSectionOk, unansweredCount } from '@/lib/forgeFleetDvirRules'
import type { SubmitDvirResult } from '@/lib/forgeFleetDvirs'

export type DvirFormInput = {
  tripType: string
  inspectionDate: string
  odometer: number | null
  trailerNumbers: string
  items: { id: string; answer: DvirAnswer; notes: string | null }[]
  remarks: string
  conditionSatisfactory: boolean
  driverName: string
  driverSignatureImage: string | null
}

const SECTIONS: DvirSection[] = ['truck', 'safety', 'trailer']

const ANSWERS: { value: DvirAnswer; label: string; on: string }[] = [
  { value: 'yes', label: 'Yes', on: 'bg-green-600 text-white border-green-600' },
  { value: 'no', label: 'No', on: 'bg-red-600 text-white border-red-600' },
  { value: 'na', label: 'N/A', on: 'bg-slate-600 text-white border-slate-600' }
]

/**
 * Port slice 11 (piece B): the driver's DVIR checklist (1.0 dvir-form.tsx), mobile first. Used on the office
 * page (/fleet/dvirs/new) and the scan page (/scan/<token>/dvir/<trip>). The server checks everything again.
 */
const DvirForm = ({
  mode,
  submit,
  vehicle,
  today,
  defaultDriverName,
  lockedTrip,
  menuHref
}: {
  mode: 'office' | 'scan'
  submit: (input: DvirFormInput) => Promise<SubmitDvirResult>
  vehicle: { name: string; number: string; mileage: number | null }
  today: string
  defaultDriverName: string
  lockedTrip?: DvirTripType
  menuHref?: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tripType, setTripType] = useState<DvirTripType>(lockedTrip || 'pre_trip')
  const [inspectionDate, setInspectionDate] = useState(today)
  const [odometer, setOdometer] = useState('')
  const [trailerNumbers, setTrailerNumbers] = useState('')
  const [answers, setAnswers] = useState<DvirDraftAnswers>({})
  const [remarks, setRemarks] = useState('')
  const [satisfactory, setSatisfactory] = useState(false)
  const [driverName, setDriverName] = useState(defaultDriverName)
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Extract<SubmitDvirResult, { ok: true }> | null>(null)

  const onSignature = useCallback((value: string | null) => setSignature(value), [])
  const [maxDate, setMaxDate] = useState(today)

  // The server renders in UTC; the driver's own calendar day is the default and the latest allowed date.
  useEffect(() => {
    const now = new Date()
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    setMaxDate(local > today ? local : today)
    setInspectionDate(current => (current === today ? local : current))
  }, [today])

  const defectCount = useMemo(() => Object.values(answers).filter(entry => entry.answer === 'no').length, [answers])

  const setAnswer = (id: string, answer: DvirAnswer) => {
    setAnswers(current => ({ ...current, [id]: { answer, notes: current[id]?.notes || '' } }))
    if (answer === 'no') setSatisfactory(false)
  }

  const setNotes = (id: string, notes: string) => setAnswers(current => ({ ...current, [id]: { answer: current[id]?.answer || null, notes } }))

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const missing = unansweredCount(answers)

    if (missing) {
      setError(`Answer every item. ${missing} still ${missing === 1 ? 'needs' : 'need'} an answer.`)

      return
    }

    if (!signature) {
      setError('The driver must sign.')

      return
    }

    const odometerValue = odometer.trim() ? Number(odometer.replace(/,/g, '')) : null

    startTransition(async () => {
      const response = await submit({
        tripType,
        inspectionDate,
        odometer: odometerValue,
        trailerNumbers,
        items: DVIR_ITEMS.map(entry => ({ id: entry.id, answer: answers[entry.id]!.answer as DvirAnswer, notes: answers[entry.id]?.notes || null })),
        remarks,
        conditionSatisfactory: satisfactory && !defectCount,
        driverName,
        driverSignatureImage: signature
      }).catch(() => ({ ok: false as const, error: 'Something went wrong. Try again.' }))

      if (!response.ok) {
        setError(response.error)
        setFieldErrors(('errors' in response && response.errors) || {})

        return
      }

      setFieldErrors({})

      if (mode === 'scan') {
        setResult(response)
        window.scrollTo({ top: 0 })

        return
      }

      toast('success', `${response.number} submitted.`)
      router.push(`/fleet/dvirs/${response.id}`)
    })
  }

  if (result) return <DvirScanResult result={result} menuHref={menuHref || '/'} />

  return (
    <form onSubmit={onSubmit} className='flex flex-col gap-4' data-testid='dvir-form' noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Inspection</CardTitle>
          <CardDescription>
            {vehicle.name} ({vehicle.number}){vehicle.mileage != null ? ` · current mileage ${vehicle.mileage.toLocaleString()}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <div className='flex flex-col gap-2 sm:col-span-2'>
            <span className='text-sm font-medium'>Trip</span>
            {lockedTrip ? (
              <p className='font-semibold' data-testid='dvir-trip'>
                {DVIR_TRIP_LABELS[lockedTrip]}
              </p>
            ) : (
              <div className='grid grid-cols-2 gap-2' role='group' aria-label='Trip'>
                {DVIR_TRIP_TYPES.map(trip => (
                  <button
                    key={trip}
                    type='button'
                    aria-pressed={tripType === trip}
                    data-trip={trip}
                    onClick={() => setTripType(trip)}
                    className={
                      'rounded-md border px-3 py-3 text-sm font-semibold ' + (tripType === trip ? 'bg-primary border-primary text-white' : 'bg-background text-textPrimary')
                    }
                  >
                    {DVIR_TRIP_LABELS[trip]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='dvir-date'>Date</Label>
            <Input id='dvir-date' type='date' value={inspectionDate} max={maxDate} onChange={event => setInspectionDate(event.target.value)} required />
            {fieldErrors.inspectionDate ? <p className='text-xs text-red-600'>{fieldErrors.inspectionDate}</p> : null}
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='dvir-odometer'>Odometer (miles)</Label>
            <Input id='dvir-odometer' inputMode='numeric' value={odometer} onChange={event => setOdometer(event.target.value)} placeholder='Optional' />
            {fieldErrors.odometer ? <p className='text-xs text-red-600'>{fieldErrors.odometer}</p> : null}
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='dvir-trailers'>Trailer number(s)</Label>
            <Input id='dvir-trailers' value={trailerNumbers} onChange={event => setTrailerNumbers(event.target.value)} placeholder='Optional' />
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='dvir-driver'>Driver name</Label>
            <Input id='dvir-driver' value={driverName} onChange={event => setDriverName(event.target.value)} autoComplete='name' required />
            {fieldErrors.driverName ? <p className='text-xs text-red-600'>{fieldErrors.driverName}</p> : null}
          </div>
        </CardContent>
      </Card>

      {SECTIONS.map(section => {
        const left = unansweredCount(answers, section)

        return (
          <Card key={section} data-dvir-section={section}>
            <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2 space-y-0'>
              <div>
                <CardTitle>{DVIR_SECTION_LABELS[section]}</CardTitle>
                <CardDescription>{left ? `${left} to answer. No needs a note.` : 'All answered.'}</CardDescription>
              </div>
              <Button type='button' variant='outline' size='sm' onClick={() => setAnswers(current => markSectionOk(current, section))} disabled={!left} data-testid={`dvir-all-ok-${section}`}>
                <TbChecks />
                All OK
              </Button>
            </CardHeader>
            <CardContent className='flex flex-col gap-2'>
              {DVIR_ITEMS.filter(entry => entry.section === section).map(entry => {
                const current = answers[entry.id]
                const problem = fieldErrors[`item:${entry.id}`]

                return (
                  <div
                    key={entry.id}
                    data-dvir-item={entry.id}
                    className={'flex flex-col gap-2 rounded-md border p-3 ' + (current?.answer === 'no' ? 'border-red-400 bg-red-50 dark:bg-red-950/30' : '')}
                  >
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='font-medium'>{entry.label}</span>
                      <div className='flex gap-1' role='group' aria-label={`${entry.label} answer`}>
                        {ANSWERS.map(option => (
                          <button
                            key={option.value}
                            type='button'
                            data-answer={option.value}
                            aria-pressed={current?.answer === option.value}
                            onClick={() => setAnswer(entry.id, option.value)}
                            className={'min-w-14 rounded-md border px-3 py-2 text-sm font-semibold ' + (current?.answer === option.value ? option.on : 'bg-background text-textPrimary')}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {current?.answer === 'no' ? (
                      <div className='flex flex-col gap-1'>
                        <Label htmlFor={`dvir-note-${entry.id}`}>Describe the defect</Label>
                        <textarea
                          id={`dvir-note-${entry.id}`}
                          className='border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm'
                          value={current.notes}
                          onChange={event => setNotes(entry.id, event.target.value)}
                          required
                        />
                      </div>
                    ) : null}
                    {problem ? <p className='text-xs text-red-600'>{problem}</p> : null}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}

      <Card>
        <CardHeader>
          <CardTitle>Remarks and signature</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='dvir-remarks'>Remarks</Label>
            <textarea
              id='dvir-remarks'
              className='border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm'
              value={remarks}
              onChange={event => setRemarks(event.target.value)}
              placeholder='Optional'
            />
          </div>
          <label className='flex items-start gap-2 text-sm'>
            <input
              type='checkbox'
              className='mt-1 size-4'
              checked={satisfactory && !defectCount}
              disabled={defectCount > 0}
              onChange={event => setSatisfactory(event.target.checked)}
              data-testid='dvir-satisfactory'
            />
            <span>
              Condition of the above vehicle is satisfactory
              {defectCount ? <span className='text-textSecondary block text-xs'>Not available: {defectCount} defect{defectCount === 1 ? '' : 's'} recorded.</span> : null}
            </span>
          </label>
          {fieldErrors.conditionSatisfactory ? <p className='text-xs text-red-600'>{fieldErrors.conditionSatisfactory}</p> : null}
          <SignaturePad label={`Driver signature${driverName.trim() ? ` (${driverName.trim()})` : ''}`} onChange={onSignature} disabled={pending} />
          {error ? (
            <p className='rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800' role='alert' data-testid='dvir-error'>
              {error}
            </p>
          ) : null}
          {defectCount ? (
            <p className='rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900'>
              {defectCount} defect{defectCount === 1 ? '' : 's'} will be reported to the mechanics. The vehicle may be taken out of service until the repairs are certified.
            </p>
          ) : null}
          <Button type='submit' size='lg' className='w-full' disabled={pending} data-testid='dvir-submit'>
            {pending ? 'Submitting…' : 'Submit DVIR'}
          </Button>
        </CardContent>
      </Card>
    </form>
  )
}

export default DvirForm
