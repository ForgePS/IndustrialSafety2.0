import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import {
  CLOSEOUT_PHOTO_MAX_BYTES,
  CLOSEOUT_PHOTOS_MAX,
  submitPublicCloseout,
  type CloseoutPhotoInput
} from '@/lib/forgeCapaCloseout'

export const dynamic = 'force-dynamic'

// Notes, name and five 10 MB photos, plus multipart overhead.
const MAX_BODY_BYTES = CLOSEOUT_PHOTOS_MAX * CLOSEOUT_PHOTO_MAX_BYTES + 512 * 1024

/**
 * Public closeout submission (no sign-in; the token is the only credential). Same-origin form posts only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  let validOrigin = false

  if (origin && host) {
    try {
      validOrigin = new URL(origin).host === host
    } catch {
      validOrigin = false
    }
  }

  if (!validOrigin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })

  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'The photos are too large. Each must be under 10 MB.' }, { status: 413 })
  }

  let form: FormData

  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Unable to read the submission.' }, { status: 400 })
  }

  const files = form.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0)

  if (files.length > CLOSEOUT_PHOTOS_MAX) {
    return NextResponse.json({ error: `Attach at most ${CLOSEOUT_PHOTOS_MAX} photos.` }, { status: 400 })
  }

  if (files.some(file => file.size > CLOSEOUT_PHOTO_MAX_BYTES)) {
    return NextResponse.json({ error: 'Each photo must be under 10 MB.' }, { status: 400 })
  }

  const photos: CloseoutPhotoInput[] = await Promise.all(
    files.map(async file => ({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }))
  )

  const result = await submitPublicCloseout({
    rawToken: token,
    name: String(form.get('name') || ''),
    notes: String(form.get('notes') || ''),
    photos
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  revalidatePath('/corrective-actions')
  revalidatePath('/corrective-actions/' + result.correctiveActionId)
  revalidatePath('/tasks')
  if (result.linkedTaskId) revalidatePath('/tasks/' + result.linkedTaskId)

  return NextResponse.json({ ok: true })
}
