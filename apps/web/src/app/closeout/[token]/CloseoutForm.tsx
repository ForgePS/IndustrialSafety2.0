'use client'

import { useState } from 'react'

import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'

const NOTES_MAX = 5000
const PHOTOS_MAX = 5
const PHOTO_MAX_BYTES = 10 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const CloseoutForm = ({ token }: { token: string }) => {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const choosePhotos = (list: FileList | null) => {
    const files = Array.from(list || [])

    setError(null)

    if (files.length > PHOTOS_MAX) return setError(`Attach at most ${PHOTOS_MAX} photos.`)
    if (files.some(file => !PHOTO_TYPES.includes(file.type))) return setError('Photos must be JPG, PNG or WebP images.')
    if (files.some(file => file.size > PHOTO_MAX_BYTES)) return setError('Each photo must be under 10 MB.')

    setPhotos(files)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!notes.trim() || busy) return

    setBusy(true)
    setError(null)

    const body = new FormData()

    body.set('name', name.trim())
    body.set('notes', notes.trim())
    for (const photo of photos) body.append('photos', photo)

    try {
      const response = await fetch('/api/closeout/' + encodeURIComponent(token), { method: 'POST', body })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) setError(result.error || 'Unable to submit closeout. Try again.')
      else setDone(true)
    } catch {
      setError('Unable to submit closeout. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className='rounded-lg border border-green-600/40 bg-green-600/10 p-4' role='status' data-testid='closeout-done'>
        Closeout submitted. Thank you. A supervisor will verify the work.
      </div>
    )
  }

  return (
    <form className='flex flex-col gap-4' onSubmit={submit} data-testid='closeout-form'>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='closeout-name'>Your name</Label>
        <Input id='closeout-name' value={name} maxLength={200} autoComplete='name' onChange={event => setName(event.target.value)} />
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='closeout-notes'>Closeout notes</Label>
        <Textarea
          id='closeout-notes'
          required
          rows={6}
          maxLength={NOTES_MAX}
          value={notes}
          placeholder='What was done to correct the issue?'
          onChange={event => setNotes(event.target.value)}
        />
        <div className='text-textSecondary text-xs'>{notes.length} / {NOTES_MAX}</div>
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='closeout-photos'>Evidence photos (optional, up to {PHOTOS_MAX})</Label>
        <Input id='closeout-photos' type='file' accept={PHOTO_TYPES.join(',')} multiple onChange={event => choosePhotos(event.target.files)} />
        {photos.length ? <div className='text-textSecondary text-xs'>{photos.length} photo{photos.length === 1 ? '' : 's'} selected</div> : null}
      </div>
      {error ? (
        <div className='text-destructive text-sm' role='alert'>
          {error}
        </div>
      ) : null}
      <Button type='submit' disabled={busy || !notes.trim()}>
        {busy ? 'Submitting…' : 'Submit Closeout'}
      </Button>
    </form>
  )
}

export default CloseoutForm
