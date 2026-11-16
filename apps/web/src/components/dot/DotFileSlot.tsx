'use client'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'
import { TbFileText, TbPaperclip, TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { removeDotFile } from '@/app/(back)/dot/actions'
import { DOT_FILE_MAX_BYTES, DOT_FILE_TYPES } from '@/lib/forgeDotRules'

export type DotUpload = { id: string; file_name: string; content_type: string; created_at: string }

/**
 * Uploaded copies for one slot: open, remove, and add (file picker or phone camera).
 * Files go to /api/dot/files, which checks permission, scope, type and size again.
 */
const DotFileSlot = ({
  parentType,
  parentId,
  slot,
  files,
  canEdit,
  label
}: {
  parentType: 'dqf' | 'company_driver' | 'record'
  parentId: string
  slot: string
  files: DotUpload[]
  canEdit: boolean
  label: string
}) => {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)

    try {
      for (const file of Array.from(list)) {
        if (!(DOT_FILE_TYPES as readonly string[]).includes(file.type)) {
          toast('error', `${file.name}: choose a PDF or photo.`)
          continue
        }

        if (file.size > DOT_FILE_MAX_BYTES) {
          toast('error', `${file.name} is over 12 MB.`)
          continue
        }

        const body = new FormData()

        body.set('file', file)
        body.set('parentType', parentType)
        body.set('parentId', parentId)
        body.set('slot', slot)

        const response = await fetch('/api/dot/files', { method: 'POST', body })
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
    <div className='flex flex-wrap items-center gap-2' data-dot-slot={slot}>
      {files.map(file => (
        <span key={file.id} className='bg-secondary inline-flex items-center gap-1 rounded px-2 py-1 text-xs'>
          <TbFileText />
          <a href={'/api/dot/files/' + file.id} target='_blank' rel='noopener' className='text-primary max-w-48 truncate hover:underline'>
            {file.file_name}
          </a>
          {canEdit ? (
            <button
              type='button'
              aria-label={'Remove ' + file.file_name}
              className='text-textSecondary hover:text-destructive ml-1'
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(`Remove ${file.file_name} from this file? It stays in the audit history.`)) return
                setBusy(true)
                const result = await removeDotFile({ id: file.id })

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
            accept={DOT_FILE_TYPES.join(',')}
            multiple
            aria-label={'Upload ' + label}
            onChange={event => upload(event.target.files)}
          />
          <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => input.current?.click()}>
            <TbPaperclip />
            {busy ? 'Uploading...' : files.length ? 'Add copy' : 'Upload copy'}
          </Button>
        </>
      ) : !files.length ? (
        <span className='text-textSecondary text-xs'>No copy</span>
      ) : null}
    </div>
  )
}

export default DotFileSlot
