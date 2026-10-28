// Next Imports
import { redirect } from 'next/navigation'

// Util Imports
import { getAuthUser } from '@repo/supabase/serverHelpers'

// There is no public marketing site: the root sends people to sign-in or to the app.
// Redirect here rather than in middleware: Next rewrites middleware redirects through NextURL,
// which turns 127.0.0.1 into localhost, and a redirect to another host loses the session cookie.
const RootPage = async () => {
  const {
    data: { user }
  } = await getAuthUser()

  redirect(user ? '/dashboard' : '/auth/login')
}

export default RootPage
