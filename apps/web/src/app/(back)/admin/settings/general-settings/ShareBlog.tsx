// React Imports
import { useEffect, useState } from 'react'

// Third-party Imports
import { toast } from 'sonner'
import { TbX } from 'react-icons/tb'
import { CardContent } from '@repo/ui/components/ui/card'
import { Switch } from '@repo/ui/components/ui/switch'
import { Label } from '@repo/ui/components/ui/label'
import SubmitButton from '@repo/ui/components/SubmitButton'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'
import { getPublicGeneralSettings } from '@repo/supabase/clientHelpers'
import { createClient } from '@repo/supabase/client'

const ShareBlog = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
  // States
  const [shareThisEnabled, setShareThisEnabled] = useState<boolean>(settings.share_this_enabled)

  // Vars
  const supabase = createClient()

  // Save Changes Handler
  const handleSubmit = async (formData: FormData) => {
    const isSwitchOn = (formData.get('share-enabled') as string) === 'on'

    const { error } = await supabase
      .from('settings_configuration')
      .update({ value: JSON.stringify({ ...settings, share_this_enabled: isSwitchOn }) })
      .eq('key', 'general_settings')

    if (!error) {
      setShareThisEnabled(isSwitchOn)
      toast.success('Settings saved!', {
        cancel: {
          label: <TbX />,
          onClick: () => {}
        },
        duration: 2000
      })
    }
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
      <form>
        <div className='flex flex-col items-start'>
          <div className='mbe-2 flex items-center'>
            <Switch
              id='share-enabled'
              name='share-enabled'
              checked={shareThisEnabled}
              onCheckedChange={value => setShareThisEnabled(value)}
            />
            <Label htmlFor='share-enabled' className='mis-2 font-medium'>
              Share This Enabled<span className='text-destructive'>*</span>
            </Label>
          </div>
          <p className='text-textDisabled text-sm'>If enabled, the Share This widget will be visible on the blog.</p>
        </div>
        <SubmitButton formAction={handleSubmit} className='mbs-6 max-sm:is-full' pendingText='Saving Changes...'>
          Save Changes
        </SubmitButton>
      </form>
    </CardContent>
  )
}

export default ShareBlog
