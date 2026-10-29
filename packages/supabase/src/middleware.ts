// Next Imports
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Third-party Imports
import { createServerClient } from '@supabase/ssr'
import { jwtDecode } from 'jwt-decode'
import { checkRoutePermissions } from '@repo/rbac/utils'
import type { JwtPayload } from 'jwt-decode'
import type { User } from '@supabase/supabase-js'


type JWT = JwtPayload & {
  roles: string[]
  permissions: string[]
  user_metadata?: {
    email?: string
    name?: string
    [key: string]: any
  }
}

type ExtendedUser = User & {
  roles?: string[]
  permissions?: string[]
  publicData?: JWT['user_metadata']
}

export async function updateSession(request: NextRequest, isMagicLinkEnabled: boolean) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        }
      }
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const [
    {
      data: { user }
    },
    {
      data: { session }
    }
  ] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()])

  // Use the verified user data instead of session.user
  const currentUser = user as ExtendedUser | null

  if (session && user) {
    const jwt: JWT = jwtDecode(session.access_token)

    if (currentUser) {
      currentUser.roles = jwt.roles
      currentUser.permissions = jwt.permissions
      currentUser.publicData = jwt.user_metadata

      if (!currentUser.publicData || !currentUser.publicData.email) {
        console.error('Public user data missing in JWT')

        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }
  }

  const { pathname } = request.nextUrl

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url))

  if (user && currentUser) {
    const { permissions } = currentUser

    // Check permissions based on the route
    if (!checkRoutePermissions(pathname, permissions || [])) {
      return redirectTo('/not-authorized')
    }

    // Signed-in users never see the sign-in pages; everyone lands on the dashboard.
    if (pathname.startsWith('/auth')) {
      return redirectTo('/dashboard')
    }
  } else if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/my-profile') ||
    pathname.startsWith('/reset-password') ||
    (pathname.startsWith('/auth/magic-link') && !isMagicLinkEnabled)
  ) {
    // Signed-out visitors to app pages go to sign-in.
    return redirectTo('/auth/login')
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*']
}
