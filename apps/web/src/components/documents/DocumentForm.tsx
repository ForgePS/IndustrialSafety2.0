'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { createDocument, updateDocument } from '@/app/(back)/documents/actions'

export type DocumentFormValues = {
  documentNumber: string
  name: string
  description: string
  category: string
  locationId: string
  ownerUserId: string
  reviewIntervalMonths: string
  reviewDueOn: string
  requiresAcknowledgment: boolean
}

type Option = { id: string; name: string }

const inputClass = 'border-input bg-card mt-1 h-[38px] w-full rounded-md border px-3 text-sm'

/** Port slice 12: create / edit a controlled document's details. */
const DocumentForm = ({
  documentId,
  initial,
  folders,
  locations,
  members,
  intervals,
  allowCompanyWide
}: {
  documentId?: string
  initial: DocumentFormValues
  folders: string[]
  locations: Option[]
  members: Option[]
  intervals: number[]
  allowCompanyWide: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (key: keyof DocumentFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues(current => ({ ...current, [key]: event.target.value }))

  const error = (key: string) => (errors[key] ? <p className='text-destructive mt-1 text-xs'>{errors[key]}</p> : null)

  return (
    <form
      className='flex flex-col gap-6'
      noValidate
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = documentId ? await updateDocument(documentId, values) : await createDocument(values)

          setErrors(result.errors || {})
          if (result.errors) return void toast('error', 'Check the highlighted fields.')
          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.push('/documents/' + (result.id || documentId))
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='grid gap-4 md:grid-cols-2'>
        <div className='md:col-span-2'>
          <Label htmlFor='document-name'>Name</Label>
          <input id='document-name' className={inputClass} value={values.name} maxLength={300} onChange={set('name')} />
          {error('name')}
        </div>
        <div>
          <Label htmlFor='document-number'>Document number</Label>
          <input
            id='document-number'
            className={inputClass}
            value={values.documentNumber}
            maxLength={60}
            placeholder={documentId ? '' : 'Leave blank to number it automatically'}
            onChange={set('documentNumber')}
          />
          {error('documentNumber')}
        </div>
        <div>
          <Label htmlFor='document-folder'>Folder</Label>
          <select id='document-folder' className={inputClass} value={values.category} onChange={set('category')}>
            <option value=''>Not in a folder</option>
            {folders.map(folder => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
          {error('category')}
        </div>
        <div>
          <Label htmlFor='document-location'>Location</Label>
          <select id='document-location' className={inputClass} value={values.locationId} onChange={set('locationId')}>
            {allowCompanyWide || !values.locationId ? <option value=''>Company-wide</option> : null}
            {locations.map(location => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          {error('locationId')}
        </div>
        <div>
          <Label htmlFor='document-owner'>Owner</Label>
          <select id='document-owner' className={inputClass} value={values.ownerUserId} onChange={set('ownerUserId')}>
            <option value=''>No owner</option>
            {members.map(member => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          {error('ownerUserId')}
        </div>
        <div>
          <Label htmlFor='document-review-interval'>Review every</Label>
          <select id='document-review-interval' className={inputClass} value={values.reviewIntervalMonths} onChange={set('reviewIntervalMonths')}>
            {intervals.map(months => (
              <option key={months} value={String(months)}>
                {months % 12 === 0 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} months`}
              </option>
            ))}
          </select>
          <p className='text-textSecondary mt-1 text-xs'>Approving a version sets the next review date from this.</p>
          {error('reviewIntervalMonths')}
        </div>
        {documentId ? (
          <div>
            <Label htmlFor='document-review-due'>Next review</Label>
            <input id='document-review-due' type='date' className={inputClass} value={values.reviewDueOn} onChange={set('reviewDueOn')} />
            {error('reviewDueOn')}
          </div>
        ) : null}
        <div className='md:col-span-2'>
          <Label htmlFor='document-description'>Description</Label>
          <textarea id='document-description' className='border-input bg-card mt-1 min-h-24 w-full rounded-md border p-3 text-sm' value={values.description} maxLength={4000} onChange={set('description')} />
          {error('description')}
        </div>
        <label className='flex items-start gap-2 text-sm md:col-span-2'>
          <input
            id='document-requires-ack'
            type='checkbox'
            className='mt-1'
            checked={values.requiresAcknowledgment}
            onChange={event => setValues(current => ({ ...current, requiresAcknowledgment: event.target.checked }))}
          />
          <span>
            People it is distributed to must read and acknowledge it.
            <span className='text-textSecondary block text-xs'>They are asked again each time a new version is approved.</span>
          </span>
        </label>
        <div className='flex gap-2 md:col-span-2'>
          <Button type='submit'>{pending ? 'Saving...' : documentId ? 'Save document' : 'Add document'}</Button>
          <Button type='button' variant='outline' onClick={() => router.push(documentId ? '/documents/' + documentId : '/documents')}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export default DocumentForm
