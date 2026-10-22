'use client'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'
import { TbCamera, TbPaperclip } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'

export const HELPDESK_UPLOAD_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/heic,video/mp4,video/quicktime,video/webm,application/pdf,text/plain,text/csv,.docx,.xlsx'

export const uploadTicketAttachment = async (basePath: string, ticketId: string, file: File, options: { visibility?: 'public' | 'internal'; messageId?: string } = {}) => {
  const form = new FormData()

  form.set('file', file)
  if (options.visibility) form.set('visibility', options.visibility)
  if (options.messageId) form.set('messageId', options.messageId)
  const response = await fetch(`${basePath}/api/helpdesk/tickets/${ticketId}/attachments`, { method: 'POST', body: form })
  const result = await response.json().catch(() => ({ error: 'Upload failed.' }))

  return response.ok ? { ok: true as const } : { ok: false as const, error: String(result.error || 'Upload failed.') }
}

// Picker with a dedicated camera button for phones/tablets in the field.
export const AttachmentPicker = ({ files, onChange, disabled, maxFiles = 5 }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean; maxFiles?: number }) => {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const add = (list: FileList | null) => {
    if (!list) return
    onChange([...files, ...Array.from(list)].slice(0, maxFiles))
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='outline' size='sm' disabled={disabled || files.length >= maxFiles} onClick={() => fileRef.current?.click()}>
          <TbPaperclip />
          Attach files
        </Button>
        <Button type='button' variant='outline' size='sm' disabled={disabled || files.length >= maxFiles} onClick={() => cameraRef.current?.click()}>
          <TbCamera />
          Take photo
        </Button>
        <input ref={fileRef} type='file' multiple accept={HELPDESK_UPLOAD_ACCEPT} className='hidden' onChange={e => { add(e.target.files); e.target.value = '' }} />
        <input ref={cameraRef} type='file' accept='image/*' capture='environment' className='hidden' onChange={e => { add(e.target.files); e.target.value = '' }} />
      </div>
      {files.length ? (
        <ul className='flex flex-col gap-1 text-sm'>
          {files.map((file, index) => (
            <li key={index} className='flex items-center justify-between gap-2 rounded-md border px-3 py-1.5'>
              <span className='truncate'>
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <Button type='button' variant='ghostDestructive' size='xs' onClick={() => onChange(files.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-textSecondary text-xs'>Screenshots, photos, short videos, PDFs, text, CSV, Word or Excel. Up to {maxFiles} files.</p>
      )}
    </div>
  )
}

// Upload form for an existing ticket (customer or staff).
const AttachmentUploader = ({ basePath, ticketId, allowInternal = false }: { basePath: string; ticketId: string; allowInternal?: boolean }) => {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)

  const upload = async () => {
    setBusy(true)
    setMessage(null)
    const errors: string[] = []

    for (const file of files) {
      const result = await uploadTicketAttachment(basePath, ticketId, file, { visibility: internal ? 'internal' : 'public' })

      if (!result.ok) errors.push(`${file.name}: ${result.error}`)
    }

    setBusy(false)
    setFiles([])
    setMessage(errors.length ? { tone: 'error', text: errors.join(' ') } : { tone: 'ok', text: 'Attachment uploaded.' })
    router.refresh()
  }

  return (
    <div className='flex flex-col gap-3'>
      <AttachmentPicker files={files} onChange={setFiles} disabled={busy} />
      {allowInternal ? (
        <label className='flex items-center gap-2 text-sm'>
          <input type='checkbox' checked={internal} onChange={e => setInternal(e.target.checked)} />
          Internal only (never visible to the customer)
        </label>
      ) : null}
      {files.length ? (
        <div>
          <Button type='button' size='sm' disabled={busy} onClick={upload}>
            {busy ? 'Uploading…' : `Upload ${files.length} file${files.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-destructive text-sm' : 'text-sm'}>
          {message.text}
        </p>
      ) : null}
    </div>
  )
}

export default AttachmentUploader
