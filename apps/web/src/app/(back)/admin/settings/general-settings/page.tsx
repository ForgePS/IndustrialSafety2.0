// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import Loader from '@repo/ui/components/Loader'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'
import { getPublicGeneralSettings } from '@repo/supabase/serverHelpers'

// Component Imports
import GeneralSettings from './GeneralSettings'

export const metadata: Metadata = {
  title: 'General Settings'
}

const GeneralSettingsSection = async () => {
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

const GeneralSettingsPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <GeneralSettingsSection />
    </Suspense>
  )
}

export default GeneralSettingsPage
