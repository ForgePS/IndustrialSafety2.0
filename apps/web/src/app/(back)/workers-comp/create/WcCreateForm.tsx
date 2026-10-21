'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { createWcCase } from '../actions'
import type { WcCreateValues } from '../actions'
import { WC_SEVERITIES, WC_SEVERITY_LABELS } from '@/lib/forgeWorkersCompRules'

type Option = { id: string; label: string }

const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'

const WcCreateForm = ({
  incidents,
  people,
  locations,
  initialValues
}: {
  incidents: Option[]
  people: Option[]
  locations: Option[]
  initialValues: WcCreateValues
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<WcCreateValues>(initialValues)
  const set = (key: keyof WcCreateValues, value: string) => setValues(current => ({ ...current, [key]: value }))

  const submit = () =>
    startTransition(async () => {
      const result = await createWcCase(values)

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Case opened.')
      if (result.id) router.push(`/workers-comp/${result.id}`)
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Workers&apos; Comp Case</CardTitle>
        <CardDescription>Link the injury incident when there is one: the injury date and Location are taken from it.</CardDescription>
      </CardHeader>
      <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
        <div className='md:col-span-6'>
          <Label htmlFor='wc-incident'>Injury incident</Label>
          <select id='wc-incident' className={selectClass} value={values.incident_id} disabled={pending} onChange={event => set('incident_id', event.target.value)}>
            <option value=''>No incident</option>
            {incidents.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className='md:col-span-6'>
          <Label htmlFor='wc-employee'>Employee</Label>
          <select id='wc-employee' className={selectClass} value={values.personnel_id} disabled={pending} onChange={event => set('personnel_id', event.target.value)}>
            <option value=''>Not in personnel (enter name below)</option>
            {people.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        {!values.personnel_id ? (
          <div className='md:col-span-6'>
            <Label htmlFor='wc-employee-name'>Employee name</Label>
            <Input id='wc-employee-name' className='mt-2' value={values.employee_name} disabled={pending} onChange={event => set('employee_name', event.target.value)} />
          </div>
        ) : null}
        <div className='md:col-span-3'>
          <Label htmlFor='wc-injury-date'>Injury date</Label>
          <Input id='wc-injury-date' type='date' className='mt-2' value={values.injury_date} disabled={pending} onChange={event => set('injury_date', event.target.value)} />
          <p className='text-textSecondary mt-1 text-xs'>Leave blank to use the incident date.</p>
        </div>
        <div className='md:col-span-3'>
          <Label htmlFor='wc-reported-date'>Reported to employer</Label>
          <Input id='wc-reported-date' type='date' className='mt-2' value={values.reported_date} disabled={pending} onChange={event => set('reported_date', event.target.value)} />
        </div>
        <div className='md:col-span-6'>
          <Label htmlFor='wc-location'>Location</Label>
          <select id='wc-location' className={selectClass} value={values.location_id} disabled={pending} onChange={event => set('location_id', event.target.value)}>
            <option value=''>From incident or employee</option>
            {locations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className='md:col-span-6'>
          <Label htmlFor='wc-severity'>Severity</Label>
          <select id='wc-severity' className={selectClass} value={values.severity} disabled={pending} onChange={event => set('severity', event.target.value)}>
            <option value=''>Not yet known</option>
            {WC_SEVERITIES.map(item => <option key={item} value={item}>{WC_SEVERITY_LABELS[item]}</option>)}
          </select>
        </div>
        <div className='flex flex-wrap gap-3 md:col-span-12'>
          <Button disabled={pending} onClick={submit}>{pending ? 'Opening...' : 'Open Case'}</Button>
          <Button variant='tonalDefault' asChild><Link href='/workers-comp'>Cancel</Link></Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default WcCreateForm
