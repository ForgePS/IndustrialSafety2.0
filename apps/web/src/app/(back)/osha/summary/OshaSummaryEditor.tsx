'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { certifyOshaEstablishmentYear, reopenOshaEstablishmentYear, saveOshaEstablishmentYear } from '../actions'
import type { OshaSummaryValues } from '../actions'

type Result = { error?: string; message?: string }

const OshaSummaryEditor = ({
  locationId,
  year,
  summaryId,
  rowVersion,
  certified,
  initialValues,
  initialCertification,
  canEdit,
  canCertify
}: {
  locationId: string
  year: number
  summaryId: string | null
  rowVersion: number | null
  certified: boolean
  initialValues: OshaSummaryValues
  initialCertification: { certifier_name: string; certifier_title: string; certifier_phone: string; certification_date: string }
  canEdit: boolean
  canCertify: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<OshaSummaryValues>(initialValues)
  const [certification, setCertification] = useState(initialCertification)
  const disabled = !canEdit || certified || pending

  const run = (action: () => Promise<Result>) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      router.refresh()
    })

  const field = (key: keyof OshaSummaryValues, label: string, className = 'md:col-span-6', inputMode?: 'numeric' | 'decimal') => (
    <div className={className}>
      <Label htmlFor={`summary-${key}`}>{label}</Label>
      <Input
        id={`summary-${key}`}
        className='mt-2'
        inputMode={inputMode}
        value={String(values[key] ?? '')}
        disabled={disabled}
        onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))}
      />
    </div>
  )

  const certField = (key: keyof typeof certification, label: string, type = 'text') => (
    <div className='md:col-span-6'>
      <Label htmlFor={`certify-${key}`}>{label}</Label>
      <Input
        id={`certify-${key}`}
        type={type}
        className='mt-2'
        value={certification[key]}
        disabled={!canCertify || certified || pending}
        onChange={event => setCertification(current => ({ ...current, [key]: event.target.value }))}
      />
    </div>
  )

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>Establishment Information</CardTitle>
          <CardDescription>Annual average employees and total hours worked drive the incidence rates.</CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {field('establishment_name', 'Establishment name', 'md:col-span-12')}
          {field('street', 'Street', 'md:col-span-12')}
          {field('city', 'City', 'md:col-span-5')}
          {field('state', 'State', 'md:col-span-3')}
          {field('zip', 'ZIP', 'md:col-span-4')}
          {field('industry_description', 'Industry description', 'md:col-span-8')}
          {field('naics_code', 'NAICS code', 'md:col-span-4', 'numeric')}
          {field('annual_average_employees', 'Annual average number of employees', 'md:col-span-6', 'numeric')}
          {field('total_hours_worked', 'Total hours worked by all employees last year', 'md:col-span-6', 'decimal')}
          {canEdit && !certified ? (
            <div className='md:col-span-12'>
              <Button disabled={pending} onClick={() => run(() => saveOshaEstablishmentYear({ locationId, year, rowVersion, values }))}>
                {pending ? 'Saving...' : 'Save Summary'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card data-testid='osha-certification'>
        <CardHeader>
          <CardTitle>Certification</CardTitle>
          <CardDescription>
            A company executive certifies the summary (29 CFR 1904.32). Certifying freezes the totals shown on the posted Form 300A.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {certField('certifier_name', 'Company executive')}
          {certField('certifier_title', 'Title')}
          {certField('certifier_phone', 'Phone', 'tel')}
          {certField('certification_date', 'Date', 'date')}
          {canCertify ? (
            <div className='flex flex-wrap gap-3 md:col-span-12'>
              {certified ? (
                <Button
                  variant='outline'
                  disabled={pending || !summaryId}
                  onClick={() => {
                    const reason = window.prompt('Why does this certified summary need to be reopened?')

                    if (reason && summaryId && rowVersion !== null) run(() => reopenOshaEstablishmentYear({ summaryId, rowVersion, reason }))
                  }}
                >
                  Reopen Summary
                </Button>
              ) : (
                <Button
                  disabled={pending || !summaryId || rowVersion === null}
                  onClick={() => summaryId && rowVersion !== null && run(() => certifyOshaEstablishmentYear({ summaryId, rowVersion, values: certification }))}
                >
                  Certify {year} Summary
                </Button>
              )}
              {!summaryId ? <p className='text-textSecondary text-sm'>Save the establishment information first.</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default OshaSummaryEditor
