// Next Imports
import type { NextRequest } from 'next/server'

// Third-party Imports
import { updateSession } from '@repo/supabase/middleware'

// Config Imports
import authConfig from '@configs/authConfig'

import { updateCognitoSession } from '@/lib/platform/cognitoMiddleware'

export async function middleware(request: NextRequest) {
  // Inside 1.0, sign-in comes from 1.0's Cognito session (docs/INTEGRATION_2X_INTO_1X_PLAN.md).
  if (process.env.FORGE_AUTH_PROVIDER === 'cognito') return await updateCognitoSession(request)

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
