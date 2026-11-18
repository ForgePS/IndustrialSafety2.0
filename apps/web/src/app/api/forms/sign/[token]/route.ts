import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { MAX_SIGNATURE_BYTES } from '@/lib/forgeFormRules'
import { signWithLink } from '@/lib/forgeFormSigning'
import { optionalUserId } from '@/lib/platform/identity'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = MAX_SIGNATURE_BYTES + 16 * 1024

/**
 * Signs a form field through a sign link (POST {name, image}). Same-origin requests only. A supervisor link
 * needs no sign-in; an EHS Director link needs the requested user signed in (checked in signWithLink).
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
    return NextResponse.json({ error: 'The signature image is too large.' }, { status: 413 })
  }

  let body: { name?: unknown; image?: unknown }

  try {
    const text = await request.text()

    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'The signature image is too large.' }, { status: 413 })
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Unable to read the signature.' }, { status: 400 })
  }

  const result = await signWithLink({
    rawToken: token,
    name: typeof body?.name === 'string' ? body.name : '',
    image: typeof body?.image === 'string' ? body.image : '',
    userId: await optionalUserId()
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  revalidatePath('/forms')
  revalidatePath('/forms/submissions/' + result.submissionId)

  return NextResponse.json({ ok: true, status: result.status })
}
