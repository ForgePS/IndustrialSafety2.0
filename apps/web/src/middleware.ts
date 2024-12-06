// Next Imports
import type { NextRequest } from 'next/server'

// Third-party Imports
import { updateSession } from '@repo/supabase/middleware'

// Config Imports
import authConfig from '@configs/authConfig'

export async function middleware(request: NextRequest) {
  return await updateSession(request, authConfig.providers.magicLink)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
