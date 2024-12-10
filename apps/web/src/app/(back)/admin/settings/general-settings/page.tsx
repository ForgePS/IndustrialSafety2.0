// Third-party Imports
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'
import { getPublicGeneralSettings } from '@repo/supabase/serverHelpers'

// Component Imports
import GeneralSettings from './GeneralSettings'

export const metadata = {
  title: 'General Settings'
}

const GeneralSettingsPage = async () => {
  // Vars
  const { data: settings_configuration, error } = await getPublicGeneralSettings()

  if (error) {
    console.error(error)

    return
  }

  return (
    <GeneralSettings
      settings={JSON.parse(settings_configuration?.value) as SettingsConfiguration['general_settings']}
    />
  )
}

export default GeneralSettingsPage
