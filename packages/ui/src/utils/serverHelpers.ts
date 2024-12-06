// Next Imports
import { cookies } from 'next/headers'

// Third-party Imports
import 'server-only'

// Type Imports
import type { Settings } from '@repo/ui/contexts/settingsContext'
import type { Layout, Mode, SystemMode } from '@repo/ui/types'

type AppConfig = {
  settingsCookieName: string
  mode: Mode
  layout: Layout
}

export const getSettingsFromCookie = async (appConfig: AppConfig): Promise<Settings> => {
  const cookieStore = await cookies()

  const cookieName = appConfig.settingsCookieName

  return JSON.parse(cookieStore.get(cookieName)?.value || '{}')
}

export const getMode = async (appConfig: AppConfig) => {
  const settingsCookie = await getSettingsFromCookie(appConfig)

  // Get mode from cookie or fallback to theme config
  const _mode = settingsCookie.mode || appConfig.mode

  return _mode
}

export const getSystemMode = async (appConfig: AppConfig): Promise<SystemMode> => {
  const cookieStore = await cookies()
  const mode = await getMode(appConfig)

  const colorPrefCookie = (cookieStore.get('colorPref')?.value || 'light') as SystemMode

  return (mode === 'system' ? colorPrefCookie : mode) || 'light'
}
