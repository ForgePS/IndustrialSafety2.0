// Next Imports
import 'server-only'
import { cookies } from 'next/headers'

// Third-party Imports
import { SignJWT } from 'jose'

const secretKey = process.env.SESSION_SECRET

export const encodedKey = new TextEncoder().encode(secretKey)

export async function encrypt(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function createSession(sessionName: string, data: any) {
  const encryptedData = await encrypt({ data })
  const sessionCookies = await cookies()

  sessionCookies.set(sessionName, encryptedData, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/'
  })
}
