'use client'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { DOCUMENT_TYPES } from '@/lib/forgeContractorRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

/** Port slice 15: add a company document, with an optional file (PDF or photo, 12 MB). */
const DocumentForm = ({ companyId }: { companyId: string }) => {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)
  const [docType, setDocType] = useState<string>('general_liability')
  const insurance = Boolean(DOCUMENT_TYPES.find(item => item.key === docType)?.insurance)

  return (
    <form
      ref={formRef}
      className='flex flex-col gap-3'
      data-contractor-document-form
      onSubmit={async event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const file = form.get('file')

        if (file instanceof File && file.size > 12 * 1024 * 1024) return void toast('error', 'Files must be 12 MB or smaller.')
        setPending(true)

        try {
          const response = await fetch(`/contractors/${companyId}/documents`, { method: 'POST', body: form })
          const result = await response.json().catch(() => ({}))

          if (!response.ok) return void toast('error', result.error || 'Unable to save the document.')
          toast('success', 'Document added.')
          formRef.current?.reset()
          setDocType('general_liability')
          router.refresh()
        } finally {
          setPending(false)
        }
      }}
    >
      <fieldset disabled={pending} className='grid gap-3 md:grid-cols-3'>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Type
          <select name='docType' value={docType} onChange={event => setDocType(event.target.value)} className={field}>
            {DOCUMENT_TYPES.map(item => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          {docType === 'other' ? 'Title' : 'Title (optional)'}
          <input name='title' maxLength={200} required={docType === 'other'} className={field} />
        </label>
        {insurance ? (
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Coverage ($)
            <input name='coverageAmount' inputMode='decimal' className={field} />
          </label>
        ) : (
          <span />
        )}
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Effective
          <input type='date' name='effectiveOn' className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          {insurance ? 'Expires' : 'Expires (optional)'}
          <input type='date' name='expiresOn' required={insurance} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          File (optional)
          <input type='file' name='file' accept='application/pdf,image/jpeg,image/png,image/webp' className='text-sm' />
        </label>
        <div className='md:col-span-3'>
          <Button type='submit'>{pending ? 'Saving...' : 'Add document'}</Button>
        </div>
      </fieldset>
    </form>
  )
}

export default DocumentForm
