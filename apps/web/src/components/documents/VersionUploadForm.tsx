'use client'

import { useRef, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbTrash, TbUpload } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

const MAX_BYTES = 25 * 1024 * 1024
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt'

/** Port slice 12: upload a new draft version (PDF, Office, image or text, up to 25 MB). */
const VersionUploadForm = ({ documentId, nextVersion }: { documentId: string; nextVersion: number }) => {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [summary, setSummary] = useState('')

  const upload = async () => {
    const file = fileRef.current?.files?.[0]

    if (!file) return void toast('error', 'Choose a file.')
    if (file.size > MAX_BYTES) return void toast('error', 'Files must be 25 MB or smaller.')

    setUploading(true)

    try {
      const body = new FormData()

      body.set('file', file)
      body.set('changeSummary', summary)

      const response = await fetch(`/documents/${documentId}/versions`, { method: 'POST', body })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) return void toast('error', result.error || 'Unable to upload the file.')

      toast('success', `Version ${result.versionNumber} uploaded as a draft.`)
      setSummary('')
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className='grid gap-3 border-t pt-4 md:grid-cols-2' data-testid='version-upload'>
      <div className='md:col-span-2'>
        <h3 className='font-semibold'>Upload version {nextVersion}</h3>
        <p className='text-textSecondary text-xs'>New versions start as drafts. Submit one for review to publish it.</p>
      </div>
      <div>
        <Label htmlFor='version-file'>File (PDF, Word, Excel, PowerPoint, image or text, up to 25 MB)</Label>
        <input id='version-file' ref={fileRef} type='file' accept={ACCEPT} className='mt-1 block w-full text-sm' />
      </div>
      <div>
        <Label htmlFor='version-summary'>What changed (optional)</Label>
        <input
          id='version-summary'
          className='border-input bg-card mt-1 h-[38px] w-full rounded-md border px-3 text-sm'
          value={summary}
          maxLength={2000}
          onChange={event => setSummary(event.target.value)}
        />
      </div>
      <div>
        <Button size='sm' disabled={uploading} onClick={upload}>
          <TbUpload />
          {uploading ? 'Uploading...' : 'Upload version'}
        </Button>
      </div>
    </div>
  )
}

/** Delete a draft version (submitted versions are kept for the record). */
export const DeleteDraftVersionButton = ({ documentId, versionId, versionNumber }: { documentId: string; versionId: string; versionNumber: number }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size='sm'
      variant='ghost'
      disabled={pending}
      aria-label={`Delete draft version ${versionNumber}`}
      onClick={() => {
        if (!window.confirm(`Delete draft version ${versionNumber}? The file is removed.`)) return
        startTransition(async () => {
          const response = await fetch(`/documents/${documentId}/versions/${versionId}`, { method: 'DELETE' })
          const result = await response.json().catch(() => ({}))

          if (!response.ok) return void toast('error', result.error || 'Unable to delete the version.')
          toast('success', 'Draft version deleted.')
          router.refresh()
        })
      }}
    >
      <TbTrash />
      Delete
    </Button>
  )
}

export default VersionUploadForm
