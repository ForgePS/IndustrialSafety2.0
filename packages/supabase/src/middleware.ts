// Next Imports
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Third-party Imports
import { createServerClient } from '@supabase/ssr'

// Type Imports
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

export async function updateSession(request: NextRequest, isMagicLinkEnabled: boolean) {
  let supabaseResponse = NextResponse.next({
    request
  })

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
          supabaseResponse = NextResponse.next({
            request
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        }
      }
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user }
  } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()

  const { data: settings_configuration } = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'general_settings')
    .single()

  const isBlogEnabled = (JSON.parse(settings_configuration?.value) as SettingsConfiguration['general_settings'])
    .pages_components.blog_enabled

  // Hide `blog` routes if the blog is disabled
  if (url.pathname.startsWith('/blog') && !isBlogEnabled) {
    url.pathname = '/page-not-found' // Display 404 page

    return NextResponse.rewrite(url)
  }

  const { data: publicUser } = await supabase.from('users').select(`*`).eq('user_id', user?.id).single()

  if (user) {
    if (!publicUser) {
      console.error('User not found in the public schema')

      return
    }

    const { data: userRoles } = await supabase.from('user_roles').select(`*, roles (role)`).eq('user_id', publicUser.id)

    const roles = userRoles?.map(({ roles }) => roles.role)

    // Role-based access control
    if (url.pathname.startsWith('/admin')) {
      // If the user is trying to access an admin page and is not an admin, redirect them
      if (!roles?.includes('admin')) {
        url.pathname = '/not-authorized' // Redirect to the 401 page

        return NextResponse.redirect(url)
      }
    }

    if (url.pathname.startsWith('/dashboard')) {
      // If the user is trying to access a user page and is not a user, redirect them
      if (!roles?.includes('user') && !roles?.includes('editor')) {
        url.pathname = '/not-authorized' // Redirect to the 401 page

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
