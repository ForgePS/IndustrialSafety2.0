import { NextResponse } from 'next/server'

/** Port slice 12: small helpers shared by the Document Control route handlers. */

export const routeFail = (error: string, status: number) => NextResponse.json({ error }, { status })

/** Rejects cross-site form posts (the browser always sends Origin on fetch POST / DELETE). */
export const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')

  if (!origin || !host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
