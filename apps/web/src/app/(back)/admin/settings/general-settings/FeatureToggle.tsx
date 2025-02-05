// React Imports
import { useEffect, useState } from 'react'

// Third-party Imports
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'
import { CardContent } from '@repo/ui/components/ui/card'
import { Switch } from '@repo/ui/components/ui/switch'
import { Label } from '@repo/ui/components/ui/label'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { getPublicGeneralSettings } from '@repo/supabase/clientHelpers'
import { createClient } from '@repo/supabase/client'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { toast } from '@repo/ui/utils/toast'

const FeatureToggle = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
  // States
  const [blogEnabled, setBlogEnabled] = useState<boolean>(settings.pages_components.blog_enabled)

  // Vars
  const supabase = createClient()

  // Hooks
  const { t } = useTranslation()

  // Save Changes Handler
  const handleSubmit = async (formData: FormData) => {
    const isSwitchOn = (formData.get('blog-enabled') as string) === 'on'

    const { error } = await supabase
      .from('settings_configuration')
      .update({
        value: JSON.stringify({ ...settings, pages_components: { blog_enabled: isSwitchOn } })
      })
      .eq('key', 'general_settings')

    if (!error) {
      setBlogEnabled(isSwitchOn)
      toast('success', t('admin:settingsToastSuccess'))
    }
  }

  useEffect(() => {
    const isBlogEnabled = async () => {
      const { data: settings_configuration } = await getPublicGeneralSettings()

      setBlogEnabled(
        (JSON.parse(settings_configuration?.value) as SettingsConfiguration['general_settings']).pages_components
          .blog_enabled
      )
    }

    isBlogEnabled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <CardContent className='!pbs-4'>
      <form>
        <div className='flex flex-col items-start'>
          <div className='mbe-2 flex items-center'>
            <Switch
              id='blog-enabled'
              name='blog-enabled'
              checked={blogEnabled}
              onCheckedChange={value => setBlogEnabled(value)}
            />
            <Label htmlFor='blog-enabled' className='mis-2 font-medium'>
              <Trans i18nKey='admin:settingsFeatureToggleBlogLabel' />
              <span className='text-destructive'>*</span>
            </Label>
          </div>
          <p className='text-textDisabled text-sm'>
            <Trans i18nKey='admin:settingsFeatureToggleBlogDescription' />
          </p>
        </div>
        <SubmitButton
          formAction={handleSubmit}
          className='mbs-6 max-sm:is-full'
          pendingText={<Trans i18nKey='admin:settingsApplicationSavingChanges' />}
        >
          <Trans i18nKey='admin:settingsSaveChanges' />
        </SubmitButton>
      </form>
    </CardContent>
  )
}

export default FeatureToggle
