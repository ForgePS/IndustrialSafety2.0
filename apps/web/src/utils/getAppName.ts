// Third-party Imports
import { getPublicGeneralSettings } from '@repo/supabase/clientHelpers'

// Type Imports
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Config Imports
import appConfig from '@configs/appConfig'

export const getAppName = async () => {
  const { data, error } = await getPublicGeneralSettings()

  if (error) {
    console.error('Error fetching settings: ', error.message)

    return appConfig.appName
  }

  if (data) {
    const settings = JSON.parse(data.value) as SettingsConfiguration['general_settings']
    const appName = settings?.application?.site_name?.trim() ?? appConfig.appName

    return appName
  }

  // Fallback in case no data is returned
  return appConfig.appName
}
