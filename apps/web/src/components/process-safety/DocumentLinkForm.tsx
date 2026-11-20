'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { linkDocument } from '@/app/(back)/process-safety/actions'

/** Port slice 16: link a controlled document (P&ID, procedure, PSI) to a change. */
const DocumentLinkForm = ({ mocId, documents }: { mocId: string; documents: { id: string; name: string }[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [documentId, setDocumentId] = useState('')

  if (!documents.length) return <p className='text-textSecondary text-sm'>The document library has nothing to link yet.</p>

  return (
    <form
      className='flex flex-wrap items-center gap-2'
      data-document-link-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await linkDocument(mocId, documentId)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Linked.')
          setDocumentId('')
          router.refresh()
        })
      }}
    >
      <select aria-label='Document' required value={documentId} onChange={event => setDocumentId(event.target.value)} className='bg-background rounded-md border px-3 py-2 text-sm'>
        <option value=''>Pick a document</option>
        {documents.map(item => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <Button type='submit' size='sm' disabled={pending}>
        {pending ? 'Linking...' : 'Link document'}
      </Button>
    </form>
  )
}

export default DocumentLinkForm
