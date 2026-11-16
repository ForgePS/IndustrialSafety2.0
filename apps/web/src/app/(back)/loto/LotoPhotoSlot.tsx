'use client'

import { useRef, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbArrowUpRight, TbCamera, TbClipboard, TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { toast } from '@repo/ui/utils/toast'

import LotoAnnotatedImage from '@/components/loto/LotoAnnotatedImage'
import type { LotoPhoto } from '@/lib/forgeLoto'
import { LOTO_PHOTO_MAX_BYTES, LOTO_PHOTO_TYPES, LOTO_PHOTOS_PER_SLOT } from '@/lib/forgeLotoRules'
import { deleteLotoPhoto, updateLotoPhoto } from './content-actions'
import LotoPhotoAnnotator from './LotoPhotoAnnotator'

const isPhoto = (file: File) => (LOTO_PHOTO_TYPES as readonly string[]).includes(file.type)

/**
 * Photos for the equipment (energySourceId null) or one energy source. Upload, take a photo,
 * paste from the clipboard or drop files; then add arrows and a caption.
 */
const LotoPhotoSlot = ({
  procedureId,
  energySourceId,
  photos,
  editable,
  label
}: {
  procedureId: string
  energySourceId: string | null
  photos: LotoPhoto[]
  editable: boolean
  label: string
}) => {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [annotating, setAnnotating] = useState<LotoPhoto | null>(null)
  const [dragging, setDragging] = useState(false)
  const room = LOTO_PHOTOS_PER_SLOT - photos.length

  const upload = async (files: File[]) => {
    const chosen = files.filter(isPhoto)

    if (!chosen.length) {
      toast('error', 'Choose a JPG, PNG or WebP photo.')

      return
    }

    if (chosen.length > room) {
      toast('error', room > 0 ? `Only ${room} more photo${room === 1 ? '' : 's'} fit here.` : `This slot already has ${LOTO_PHOTOS_PER_SLOT} photos.`)

      return
    }

    setUploading(true)

    try {
      for (const file of chosen) {
        if (file.size > LOTO_PHOTO_MAX_BYTES) {
          toast('error', `${file.name || 'Photo'} is over 10 MB.`)
          continue
        }

        const body = new FormData()

        body.set('file', file, file.name || 'pasted-photo.' + (file.type.split('/')[1] || 'png'))
        body.set('procedureId', procedureId)
        if (energySourceId) body.set('energySourceId', energySourceId)

        const response = await fetch('/api/loto/photos', { method: 'POST', body })
        const result = await response.json().catch(() => ({}))

        if (!response.ok) toast('error', result.error || 'Unable to upload the photo.')
      }
    } finally {
      setUploading(false)
      router.refresh()
    }
  }

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read()
      const files: File[] = []

      for (const item of items) {
        const type = item.types.find(value => (LOTO_PHOTO_TYPES as readonly string[]).includes(value))

        if (type) files.push(new File([await item.getType(type)], 'pasted-photo.' + type.split('/')[1], { type }))
      }

      if (!files.length) {
        toast('error', 'No photo on the clipboard.')

        return
      }

      await upload(files)
    } catch {
      toast('error', 'The browser blocked clipboard access. Click the drop area and press Ctrl+V instead.')
    }
  }

  const run = (action: () => Promise<{ error?: string; message?: string }>) => {
    startTransition(async () => {
      const result = await action()

      if (result.error) toast('error', result.error)
      else router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='text-sm font-semibold'>{label}</div>

      {photos.length ? (
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {photos.map(photo => (
            <div key={photo.id} className='flex flex-col gap-2 rounded-lg border p-2'>
              {photo.url ? (
                <LotoAnnotatedImage src={photo.url} alt={photo.caption || photo.file_name} annotations={photo.annotations} imgClassName='max-h-56 rounded' />
              ) : (
                <div className='text-textSecondary p-6 text-center text-sm'>Photo unavailable</div>
              )}
              {editable ? (
                <>
                  <Input
                    defaultValue={photo.caption || ''}
                    placeholder='Caption (optional)'
                    disabled={pending}
                    onBlur={event => {
                      if ((photo.caption || '') !== event.target.value.trim()) {
                        run(() => updateLotoPhoto({ procedureId, photoId: photo.id, caption: event.target.value }))
                      }
                    }}
                  />
                  <div className='flex flex-wrap gap-2'>
                    <Button size='sm' variant='outline' disabled={pending || !photo.url} onClick={() => setAnnotating(photo)}>
                      <TbArrowUpRight />Arrows
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm('Remove this photo from the procedure?')) run(() => deleteLotoPhoto({ procedureId, photoId: photo.id }))
                      }}
                    >
                      <TbTrash />Remove
                    </Button>
                  </div>
                </>
              ) : photo.caption ? (
                <div className='text-textSecondary text-xs'>{photo.caption}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : !editable ? (
        <div className='text-textSecondary text-sm'>No photos.</div>
      ) : null}

      {editable && room > 0 ? (
        <div
          tabIndex={0}
          role='button'
          aria-label={'Add photos: ' + label}
          className={
            'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm outline-none focus:border-primary ' +
            (dragging ? 'border-primary bg-primary/5' : '')
          }
          onClick={() => input.current?.click()}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') input.current?.click()
          }}
          onPaste={event => {
            const files = Array.from(event.clipboardData.files || [])

            if (files.length) {
              event.preventDefault()
              void upload(files)
            }
          }}
          onDragOver={event => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => {
            event.preventDefault()
            setDragging(false)
            void upload(Array.from(event.dataTransfer.files || []))
          }}
        >
          <TbCamera className='size-6' />
          <div>{uploading ? 'Uploading...' : 'Take or choose a photo, drop it here, or click and paste (Ctrl+V)'}</div>
          <div className='text-textSecondary text-xs'>JPG, PNG or WebP, up to 10 MB. {room} of {LOTO_PHOTOS_PER_SLOT} left.</div>
          <Button
            size='sm'
            variant='outline'
            disabled={uploading}
            onClick={event => {
              event.stopPropagation()
              void pasteFromClipboard()
            }}
          >
            <TbClipboard />Paste
          </Button>
          <input
            ref={input}
            type='file'
            accept={LOTO_PHOTO_TYPES.join(',')}
            capture='environment'
            multiple
            className='hidden'
            onChange={event => {
              const files = Array.from(event.target.files || [])

              event.target.value = ''
              void upload(files)
            }}
          />
        </div>
      ) : null}

      {annotating?.url ? (
        <LotoPhotoAnnotator
          key={annotating.id}
          open
          onOpenChange={value => {
            if (!value) setAnnotating(null)
          }}
          procedureId={procedureId}
          photo={{ id: annotating.id, url: annotating.url, file_name: annotating.file_name, annotations: annotating.annotations }}
        />
      ) : null}
    </div>
  )
}

export default LotoPhotoSlot
