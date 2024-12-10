'use client'

// React Imports
import type { ReactNode } from 'react'
import { createContext, useState } from 'react'

// Type Imports
import type { Mode } from '@repo/ui/types'

// Hook Imports
import { useObjectCookie } from '@repo/ui/hooks/useObjectCookie'

// Settings type
export type Settings = {
  mode?: Mode
}

// UpdateSettingsOptions type
type UpdateSettingsOptions = {
  updateCookie?: boolean
}

// SettingsContextProps type
type SettingsContextProps = {
  settings: Settings
  updateSettings: (settings: Partial<Settings>, options?: UpdateSettingsOptions) => void
  updatePageSettings: (settings: Partial<Settings>) => () => void
}

type Props = {
  children: ReactNode
  settingsCookie: Settings | null
  mode?: Mode
  appConfig: {
    settingsCookieName: string
    mode: Mode
  }
}

// Initial Settings Context
export const SettingsContext = createContext<SettingsContextProps | null>(null)

// Settings Provider
export const SettingsProvider = (props: Props) => {
  // Props
  const { children, mode, appConfig } = props

  // Initial Settings
  const initialSettings: Settings = {
    mode: appConfig.mode
  }

  const updatedInitialSettings = {
    ...initialSettings,
    mode: mode || appConfig.mode
  }

  // Cookies
  const [settingsCookie, updateSettingsCookie] = useObjectCookie<Settings>(
    appConfig.settingsCookieName,
    JSON.stringify(props.settingsCookie) !== '{}' ? props.settingsCookie : updatedInitialSettings
  )

  // State
  const [_settingsState, _updateSettingsState] = useState<Settings>(
    JSON.stringify(settingsCookie) !== '{}' ? settingsCookie : updatedInitialSettings
  )

  const updateSettings = (settings: Partial<Settings>, options?: UpdateSettingsOptions) => {
    const { updateCookie = true } = options || {}

    _updateSettingsState(prev => {
      const newSettings = { ...prev, ...settings }

      // Update cookie if needed
      if (updateCookie) updateSettingsCookie(newSettings)

      return newSettings
    })
  }

  /**
   * Updates the settings for page with the provided settings object.
   * Updated settings won't be saved to cookie hence will be reverted once navigating away from the page.
   *
   * @param settings - The partial settings object containing the properties to update.
   * @returns A function to reset the page settings.
   *
   * @example
   * useEffect(() => {
   *     return updatePageSettings({ theme: 'dark' });
   * }, []);
   */
  const updatePageSettings = (settings: Partial<Settings>): (() => void) => {
    updateSettings(settings, { updateCookie: false })

    // Returns a function to reset the page settings
    return () => updateSettings(settingsCookie, { updateCookie: false })
  }

  return (
    <SettingsContext.Provider
      value={{
        settings: _settingsState,
        updateSettings,
        updatePageSettings
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}
