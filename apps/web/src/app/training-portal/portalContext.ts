import { cookies } from 'next/headers'

import { PORTAL_COOKIE, resolvePortalLink, resolvePortalSession } from '@/lib/forgeTrainingLms'

/** Link and (optional) signed-in employee for a kiosk page. */
export const loadPortal = async (token: string) => {
  const link = await resolvePortalLink(token)

  if (!link) return { link: null, session: null }

  const store = await cookies()
  const session = await resolvePortalSession(link, store.get(PORTAL_COOKIE)?.value)

  return { link, session }
}
