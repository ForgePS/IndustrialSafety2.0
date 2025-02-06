// React Imports
import { useEffect, useState, useTransition } from 'react'

// Third-party Imports
import { CardContent } from '@repo/ui/components/ui/card'
import { Switch } from '@repo/ui/components/ui/switch'
import { Label } from '@repo/ui/components/ui/label'
import { Button } from '@repo/ui/components/ui/button'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'
import { getPublicGeneralSettings } from '@repo/supabase/clientHelpers'
import { createClient } from '@repo/supabase/client'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { toast } from '@repo/ui/utils/toast'

const ShareBlog = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
  // States
  const [shareThisEnabled, setShareThisEnabled] = useState<boolean>(settings.share_this_enabled)
  const [pending, startTransition] = useTransition()

  // Vars
  const supabase = createClient()

  // Hooks
  const { t } = useTranslation()

  // Save Changes Handler
  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const isSwitchOn = (formData.get('share-enabled') as string) === 'on'

      const { error } = await supabase
        .from('settings_configuration')
        .update({ value: JSON.stringify({ ...settings, share_this_enabled: isSwitchOn }) })
        .eq('key', 'general_settings')

      if (!error) {
        setShareThisEnabled(isSwitchOn)
        toast('success', t('admin:settingsToastSuccess'))
      }
    })
  }

  useEffect(() => {
    const isShareThisEnabled = async () => {
      const { data: settings_configuration } = await getPublicGeneralSettings()

      setShareThisEnabled(
        (JSON.parse(settings_configuration?.value) as SettingsConfiguration['general_settings']).share_this_enabled
      )
    }

    isShareThisEnabled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <CardContent className='pbs-4'>
      <form action={handleSubmit}>
        <div className='flex flex-col items-start'>
          <div className='mbe-2 flex items-center'>
            <Switch
              id='share-enabled'
              name='share-enabled'
              checked={shareThisEnabled}
              onCheckedChange={value => setShareThisEnabled(value)}
            />
            <Label htmlFor='share-enabled' className='mis-2 font-medium'>
              <Trans i18nKey='admin:settingsShareBlogLabel' />
              <span className='text-destructive'>*</span>
            </Label>
          </div>
          <p className='text-textDisabled text-sm'>
            <Trans i18nKey='admin:settingsShareBlogDescription' />
          </p>
        </div>
        <Button type='submit' disabled={pending} className='mbs-6 max-sm:is-full'>
          {pending ? (
            <Trans i18nKey='admin:settingsApplicationSavingChanges' />
          ) : (
            <Trans i18nKey='admin:settingsSaveChanges' />
          )}
        </Button>
      </form>
    </CardContent>
  )
}

export default ShareBlog
