'use client'

import { useRef, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { archiveVehicleDocument } from '@/app/(back)/fleet/vehicleActions'

export type VehicleDocumentRow = {
  id: string
  documentType: string
  typeLabel: string
  title: string | null
  fileName: string
  expiresOn: string | null
  expiry: 'none' | 'expired' | 'expiring' | 'ok'
  uploadedAt: string
  sizeBytes: number
}

const inputClass = 'border-input bg-card mt-1 h-[38px] w-full rounded-md border px-3 text-sm'

/** Port slice 11: vehicle documents (title, registration, insurance...) stored privately, opened by signed link. */
const VehicleDocuments = ({
  vehicleId,
  documents,
  types,
  canEdit
}: {
  vehicleId: string
  documents: VehicleDocumentRow[]
  types: { value: string; label: string }[]
  canEdit: boolean
}) => {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [documentType, setDocumentType] = useState('registration')
  const [title, setTitle] = useState('')
  const [expiresOn, setExpiresOn] = useState('')

  const upload = async () => {
    const file = fileRef.current?.files?.[0]

    if (!file) {
      toast('error', 'Choose a file.')

      return
    }

    if (file.size > 12 * 1024 * 1024) {
      toast('error', 'Files must be 12 MB or smaller.')

      return
    }

    setUploading(true)

    try {
      const body = new FormData()

      body.set('file', file)
      body.set('documentType', documentType)
      body.set('title', title)
      body.set('expiresOn', expiresOn)

      const response = await fetch(`/fleet/vehicles/${vehicleId}/documents`, { method: 'POST', body })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast('error', result.error || 'Unable to upload the file.')

        return
      }

      toast('success', 'Document added.')
      setTitle('')
      setExpiresOn('')
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card data-testid='vehicle-documents'>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {documents.length ? (
          <ul className='divide-y text-sm'>
            {documents.map(document => (
              <li key={document.id} className='flex flex-wrap items-center justify-between gap-2 py-2' data-document={document.fileName}>
                <div>
                  <a className='text-primary font-semibold hover:underline' href={`/fleet/vehicles/${vehicleId}/documents/${document.id}`}>
                    {document.title || document.fileName}
                  </a>
                  <div className='text-textSecondary text-xs'>
                    {document.typeLabel} · {document.fileName} · {Math.max(1, Math.round(document.sizeBytes / 1024))} KB
                    {document.expiresOn ? (
                      <span className={document.expiry === 'expired' ? ' text-destructive' : document.expiry === 'expiring' ? ' text-amber-600' : ''}>
                        {' · '}
                        {document.expiry === 'expired' ? 'Expired ' : 'Expires '}
                        {document.expiresOn}
                      </span>
                    ) : null}
                  </div>
                </div>
                {canEdit ? (
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await archiveVehicleDocument({ documentId: document.id })

                        if (result.error) toast('error', result.error)
                        else {
                          toast('success', result.message || 'Archived.')
                          router.refresh()
                        }
                      })
                    }
                  >
                    Archive
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-textSecondary text-sm'>No documents yet.</p>
        )}

        {canEdit ? (
          <div className='grid gap-3 border-t pt-4 md:grid-cols-2'>
            <div>
              <Label htmlFor='document-type'>Type</Label>
              <select id='document-type' className={inputClass} value={documentType} onChange={event => setDocumentType(event.target.value)}>
                {types.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor='document-expires'>Expires</Label>
              <input id='document-expires' type='date' className={inputClass} value={expiresOn} onChange={event => setExpiresOn(event.target.value)} />
            </div>
            <div>
              <Label htmlFor='document-title'>Title (optional)</Label>
              <input id='document-title' className={inputClass} value={title} maxLength={200} onChange={event => setTitle(event.target.value)} />
            </div>
            <div>
              <Label htmlFor='document-file'>File (PDF, JPG, PNG or WebP, up to 12 MB)</Label>
              <input id='document-file' ref={fileRef} type='file' accept='application/pdf,image/jpeg,image/png,image/webp' className='mt-1 block w-full text-sm' />
            </div>
            <div>
              <Button size='sm' disabled={uploading} onClick={upload}>
                {uploading ? 'Uploading...' : 'Upload document'}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default VehicleDocuments
