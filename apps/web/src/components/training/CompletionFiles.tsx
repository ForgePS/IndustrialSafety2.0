'use client'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'
import { TbFileText, TbPaperclip, TbTrash } from 'react-icons/tb'
import { toast } from '@repo/ui/utils/toast'

import { removeCompletionFile } from '@/app/(back)/training/completionFileActions'
import { ATTACHMENT_MAX_BYTES } from '@/lib/forgeTrainingReportRules'

export type CompletionFile = { id: string; file_name: string }

/** Attachments on one training record: open, remove and add (PDF or photo, 12 MB). */
const CompletionFiles = ({ completionId, files, canEdit, label }: { completionId: string; files: CompletionFile[]; canEdit: boolean; label: string }) => {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)

    try {
      for (const file of Array.from(list)) {
        if (file.size > ATTACHMENT_MAX_BYTES) {
          toast('error', `${file.name} is over 12 MB.`)
          continue
        }

        const body = new FormData()

        body.set('file', file)

        const response = await fetch(`/api/training/completions/${completionId}/files`, { method: 'POST', body })
        const result = await response.json().catch(() => ({}))

        if (!response.ok) toast('error', result.error || 'Unable to upload the file.')
      }
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
      router.refresh()
    }
  }

  return (
    <span className='inline-flex flex-wrap items-center gap-1' data-completion-files={completionId}>
      {files.map(file => (
        <span key={file.id} className='bg-secondary inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs'>
          <TbFileText />
          <a href={'/api/training/completion-files/' + file.id} target='_blank' rel='noopener' className='text-primary max-w-40 truncate hover:underline'>
            {file.file_name}
          </a>
          {canEdit ? (
            <button
              type='button'
              aria-label={'Remove ' + file.file_name}
              className='text-textSecondary hover:text-destructive'
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(`Remove ${file.file_name}?`)) return
                setBusy(true)
                const result = await removeCompletionFile({ id: file.id })

                setBusy(false)
                if (result.error) toast('error', result.error)
                router.refresh()
              }}
            >
              <TbTrash />
            </button>
          ) : null}
        </span>
      ))}
      {canEdit ? (
        <>
          <input
            ref={input}
            type='file'
            className='hidden'
            accept='.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*'
            multiple
            aria-label={'Attach to ' + label}
            onChange={event => upload(event.target.files)}
          />
          <button type='button' className='text-primary inline-flex items-center gap-1 text-xs hover:underline' disabled={busy} onClick={() => input.current?.click()}>
            <TbPaperclip />
            {busy ? 'Uploading...' : 'Attach'}
          </button>
        </>
      ) : null}
    </span>
  )
}

export default CompletionFiles
