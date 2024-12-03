'use client'

// React Imports
import { useEffect } from 'react'

// Third-party Imports
import { useCookie, useMedia } from 'react-use'
import { useTheme } from 'next-themes'

// Type Imports
import type { SystemMode } from '@repo/ui/types'

// Hook Imports
import { useSettings } from '@repo/ui/hooks/useSettings'

const SetupSystemMode = ({ modeFallback }: { modeFallback: SystemMode }) => {
  // Hooks
  const { settings } = useSettings()
  const { setTheme } = useTheme()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, updateCookieColorPref] = useCookie('colorPref')
  const isDark = useMedia('(prefers-color-scheme: dark)', modeFallback === 'dark')

  useEffect(() => {
    const appMode = isDark ? 'dark' : 'light'

    updateCookieColorPref(appMode)

    if (settings.mode === 'system') {
      // We need to change the mode in settings context to apply the mode change in the components
      setTheme(appMode)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark])

  return null
}

export default SetupSystemMode
