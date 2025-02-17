// Next Imports
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Third-party Imports
import { createServerClient } from '@supabase/ssr'
import { jwtDecode } from 'jwt-decode'
import { checkRoutePermissions } from '@repo/rbac/utils'
import type { JwtPayload } from 'jwt-decode'
import type { User } from '@supabase/supabase-js'

// Type Imports
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

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

  const url = request.nextUrl.clone()

  // Hide `blog` routes if the blog is disabled
  if (url.pathname.startsWith('/blog')) {
    const { data: settings_configuration } = await supabase
      .from('settings_configuration')
      .select('value')
      .eq('key', 'general_settings')
      .single()

    const isBlogEnabled = (JSON.parse(settings_configuration?.value) as SettingsConfiguration['general_settings'])
      .pages_components.blog_enabled

    if (!isBlogEnabled) {
      url.pathname = '/page-not-found' // Display 404 page

      return NextResponse.rewrite(url)
    }
  }

  if (user && currentUser) {
    const { roles, permissions } = currentUser

    // Role-based access control
    // Additional permission checks for specific admin routes
    if ((url.pathname === '/admin' || url.pathname.startsWith('/admin/my-profile')) && !roles?.includes('admin')) {
      url.pathname = '/not-authorized'

      return NextResponse.redirect(url)
    }

    if (url.pathname.startsWith('/dashboard') && roles?.includes('admin')) {
      url.pathname = '/not-authorized'

      return NextResponse.redirect(url)
    }

    // Check permissions based on the route
    if (!checkRoutePermissions(url.pathname, permissions || [])) {
      url.pathname = '/not-authorized'

      return NextResponse.redirect(url)
    }

    // User can only access the checkout page after selecting a product
    if (url.pathname.startsWith('/checkout')) {
      // If the user is trying to access a checkout page and is not a user, redirect them to the home page
      if (roles?.includes('admin') || request.cookies.get('checkoutData')?.value === undefined) {
        url.pathname = '/' // Redirect to the home page

        return NextResponse.redirect(url)
      }
    }

    // User can only access the thank you page after a successful payment
    if (url.pathname.startsWith('/thank-you')) {
      const { data: billingRecords } = await supabase.from('billing').select('status').eq('user_id', user.id)

      const isPaymentSuccessful = billingRecords?.filter(record => record.status === 'success')[0]?.status === 'success'

      // delete `checkoutData` cookie if the cookie exists
      if (request.cookies.has('checkoutData') && isPaymentSuccessful) {
        request.cookies.delete('checkoutData')
        supabaseResponse.cookies.delete('checkoutData')
      } else {
        url.pathname = '/' // Redirect to the home page

        return NextResponse.redirect(url)
      }
    }

    if (request.nextUrl.pathname.startsWith('/auth')) {
      url.pathname = roles?.includes('admin') ? '/admin' : '/dashboard'

      return NextResponse.redirect(url)
    }
  } else {
    if (
      request.nextUrl.pathname.startsWith('/admin') ||
      request.nextUrl.pathname.startsWith('/dashboard') ||
      request.nextUrl.pathname.startsWith('/reset-password') ||
      (request.nextUrl.pathname.startsWith('/auth/magic-link') && !isMagicLinkEnabled)
    ) {
      // no user, potentially respond by redirecting the user to the login page
      const url = request.nextUrl.clone()

      url.pathname = '/auth/login'

      return NextResponse.redirect(url)
    }
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
