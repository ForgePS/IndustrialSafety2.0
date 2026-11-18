'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { saveFormSubmission } from '@/app/(back)/forms/submissionActions'
import FormRenderer from '@/components/forms/FormRenderer'
import type { FormSchema, FormSubmissionStatus } from '@/lib/forgeFormRules'

type Option = { id: string; label: string }

/** Port slice 9: the fill / edit form around FormRenderer, with location / division and Save draft / Submit. */
const FormSubmissionEditor = ({
  templateId,
  submissionId,
  isNew,
  schema,
  initialAnswers,
  status,
  rowVersion: initialRowVersion,
  locations,
  divisions,
  initialLocationId,
  initialDivisionId,
  defaultSignerName
}: {
  templateId?: string
  submissionId: string
  isNew: boolean
  schema: FormSchema
  initialAnswers: Record<string, unknown>
  status: FormSubmissionStatus | null
  rowVersion: number | null
  locations: Option[]
  divisions: Option[]
  initialLocationId: string | null
  initialDivisionId: string | null
  defaultSignerName: string
}) => {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers)
  const [locationId, setLocationId] = useState(initialLocationId || '')
  const [divisionId, setDivisionId] = useState(initialDivisionId || '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [rowVersion, setRowVersion] = useState(initialRowVersion)
  const [pending, startTransition] = useTransition()
  const isDraft = isNew || status === 'draft'

  const save = (mode: 'draft' | 'submit') =>
    startTransition(async () => {
      setFormError(null)

      const result = await saveFormSubmission({
        ...(isNew ? { templateId, newSubmissionId: submissionId } : { submissionId, expectedRowVersion: rowVersion ?? undefined }),
        answers,
        locationId: locationId || null,
        divisionId: divisionId || null,
        mode
      })

      if (!result.ok) {
        const map: Record<string, string> = {}

        for (const item of result.fieldErrors || []) if (!map[item.fieldId]) map[item.fieldId] = item.message

        setErrors(map)
        setFormError(result.error)
        toast('error', result.error)

        return
      }

      setErrors({})
      setRowVersion(result.rowVersion)

      if (result.status === 'draft') {
        toast('success', `Draft ${result.submissionNumber} saved.`)
        if (isNew) router.replace(`/forms/submissions/${result.id}/edit`)
        else router.refresh()

        return
      }

      toast('success', result.status === 'pending_signature' ? `${result.submissionNumber} saved. It needs a signature.` : `${result.submissionNumber} saved.`)
      router.push(`/forms/submissions/${result.id}`)
      router.refresh()
    })

  return (
    <div className='flex flex-col gap-4'>
      <Card>
        <CardContent className='grid gap-4 pt-6 md:grid-cols-2'>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='form-location'>Location</Label>
            <select
              id='form-location'
              value={locationId}
              onChange={event => setLocationId(event.target.value)}
              className='border-input bg-background h-10 rounded-md border px-3 text-sm'
            >
              <option value=''>From the employee, or none</option>
              {locations.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='form-division'>Division</Label>
            <select
              id='form-division'
              value={divisionId}
              onChange={event => setDivisionId(event.target.value)}
              className='border-input bg-background h-10 rounded-md border px-3 text-sm'
            >
              <option value=''>From the employee, or none</option>
              {divisions.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className='pt-6'>
          <FormRenderer
            schema={schema}
            answers={answers}
            onChange={setAnswers}
            errors={errors}
            photoSubmissionId={submissionId}
            defaultSignerName={defaultSignerName}
          />
        </CardContent>
      </Card>

      {formError ? (
        <p className='text-destructive text-sm' role='alert' data-form-error>
          {formError}
        </p>
      ) : null}

      <div className='flex flex-wrap gap-2'>
        {isDraft ? (
          <>
            <Button type='button' variant='outline' disabled={pending} onClick={() => save('draft')}>
              Save draft
            </Button>
            <Button type='button' disabled={pending} onClick={() => save('submit')}>
              Submit
            </Button>
          </>
        ) : (
          <Button type='button' disabled={pending} onClick={() => save('submit')}>
            Save changes
          </Button>
        )}
        <Button type='button' variant='ghost' disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default FormSubmissionEditor
