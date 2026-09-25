'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

export type EvidenceListItem = {
  id: string
  file_name: string
  content_type: string
  size_bytes: number
  evidence_type: string
  description: string | null
  uploaded_at: string
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

const RecordEvidencePanel = ({
  resourceType,
  resourceId,
  evidence,
  canUpload = true
}: {
  resourceType: string
  resourceId: string
  evidence: EvidenceListItem[]
  canUpload?: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const form = event.currentTarget
    const data = new FormData(form)
    data.set('resourceType', resourceType)
    data.set('resourceId', resourceId)

    try {
      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: data
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || 'Upload failed.')
        return
      }
      setMessage(payload.message || 'Evidence uploaded.')
      form.reset()
      startTransition(() => {
        router.refresh()
      })
    } catch {
      setError('Upload failed.')
    }
  }

  return (
    <Card data-testid='record-evidence'>
      <CardHeader>
        <CardTitle>Evidence</CardTitle>
        <CardDescription>Files attached to this record.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {evidence.length ? (
          evidence.map(item => (
            <div
              key={item.id}
              className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
            >
              <div>
                <div className='font-medium'>{item.file_name}</div>
                <div className='text-textSecondary mt-1 text-xs capitalize'>
                  {item.evidence_type.replaceAll('_', ' ')} · {formatBytes(item.size_bytes)} ·{' '}
                  {new Date(item.uploaded_at).toLocaleString()}
                </div>
                {item.description ? (
                  <div className='text-textSecondary mt-1 text-sm'>{item.description}</div>
                ) : null}
              </div>
              <Button variant='outline' size='sm' asChild>
                <a href={'/api/evidence/' + item.id}>Download</a>
              </Button>
            </div>
          ))
        ) : (
          <div className='text-textSecondary text-sm'>No evidence uploaded yet.</div>
        )}

        {canUpload ? (
          <form onSubmit={onSubmit} className='flex flex-col gap-3 rounded-lg border p-3'>
            <div className='text-sm font-medium'>Upload evidence</div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='flex flex-col gap-1 text-sm'>
                <span className='text-textSecondary'>File</span>
                <input
                  type='file'
                  name='file'
                  required
                  accept='.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv'
                  className='text-sm'
                />
              </label>
              <label className='flex flex-col gap-1 text-sm'>
                <span className='text-textSecondary'>Type</span>
                <select
                  name='evidenceType'
                  defaultValue='document'
                  className='border-input bg-background rounded-md border px-3 py-2'
                >
                  <option value='photo'>Photo</option>
                  <option value='document'>Document</option>
                  <option value='video'>Video</option>
                  <option value='form'>Form</option>
                  <option value='signature'>Signature</option>
                  <option value='measurement'>Measurement</option>
                  <option value='other'>Other</option>
                </select>
              </label>
            </div>
            <label className='flex flex-col gap-1 text-sm'>
              <span className='text-textSecondary'>Description</span>
              <input
                name='description'
                placeholder='Optional description'
                className='border-input bg-background rounded-md border px-3 py-2'
              />
            </label>
            {error ? <div className='text-destructive text-sm'>{error}</div> : null}
            {message ? <div className='text-sm text-emerald-700'>{message}</div> : null}
            <Button type='submit' size='sm' className='w-fit' disabled={pending}>
              {pending ? 'Uploading…' : 'Upload'}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default RecordEvidencePanel
