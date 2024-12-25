// React Imports
// eslint-disable-next-line import/named
import { cache } from 'react'

// Next Imports
import { cookies } from 'next/headers'

// Third-party Imports
import type { i18n } from 'i18next'
import { initializeI18nServer } from '@repo/i18n/src/i18n-server'

// Util Imports
import { getI18nSettings } from './i18n-settings'
import { i18nResolver } from './i18n-resolver'

interface I18nServerInstance {
  i18nInstance: i18n
  language: string | undefined
}

const createInstanceFunction = async (): Promise<I18nServerInstance> => {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(process.env.NEXT_PUBLIC_I18N_COOKIE_NAME!)?.value

  let selectedLanguage: string | undefined

  // Get language from cookie
  if (cookie) {
    selectedLanguage = cookie
  }

  const settings = getI18nSettings(selectedLanguage)
  const i18nInstance = await initializeI18nServer(settings, i18nResolver)

  return { i18nInstance, language: selectedLanguage }
}

export const createI18nServerInstance = cache(createInstanceFunction)
