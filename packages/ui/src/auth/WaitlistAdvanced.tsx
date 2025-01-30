// Third-party Imports
import {
  TbBrandGithub,
  TbBrandDiscord,
  TbBrandTwitter,
  TbBrandInstagram,
  TbBrandYoutube,
  TbCheck
} from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@repo/ui/components/ui/dialog'
import LeftSection from '@repo/ui/auth/LeftSection'
import TranslatedInput from '@repo/ui/components/ui/translated-input'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const WaitListAdvanced = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className='min-bs-screen flex'>
      <LeftSection />
      <div className='bg-card min-bs-screen basis-full lg:basis-2/5 xl:basis-1/3'>
        <div className='plb-[12rem] bs-full flex grow flex-col items-center justify-center'>
          <div className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto mbs-6 flex flex-col gap-6'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='packages-ui:waitlistTitle' />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='packages-ui:waitlistDescription' />
              </p>
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <Label htmlFor='name'>
                  <Trans i18nKey='packages-ui:nameLabel' />
                  <sup className='text-destructive'>*</sup>
                </Label>
                <TranslatedInput id='name' type='text' translationKey='namePlaceholder' />
              </div>
              <div>
                <Label htmlFor='email'>
                  <Trans i18nKey='packages-ui:emailLabel' />
                  <sup className='text-destructive'>*</sup>
                </Label>
                <TranslatedInput id='email' type='email' translationKey='emailPlaceholder' />
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <Trans i18nKey='packages-ui:waitlistJoinButton' />
                  </Button>
                </DialogTrigger>
                <DialogContent className='sm:max-is-[425px]'>
                  <DialogTitle hidden />
                  <DialogDescription hidden />
                  <div className='flex flex-col items-center justify-center gap-y-6'>
                    <div className='is-[4.25rem] bs-[4.25rem] border-primary/30 flex items-center justify-center rounded-full border'>
                      <div className='is-12 bs-12 bg-primary flex items-center justify-center rounded-full'>
                        <TbCheck className='bs-[32px] is-[32px] text-white' />
                      </div>
                    </div>
                    <div>
                      <p className='text-textPrimary text-center text-2xl font-semibold'>
                        <Trans i18nKey='packages-ui:waitlistSuccessTitle' />
                      </p>
                      <p className='text-textSecondary text-center'>
                        <Trans
                          i18nKey='packages-ui:waitlistSuccessDescription'
                          values={{ appName }}
                          components={{ 1: <span className='font-medium' /> }}
                        />
                      </p>
                    </div>
                    <p className='text-textSecondary text-center text-sm'>
                      <Trans
                        i18nKey='packages-ui:waitlistFooterText'
                        values={{ appName }}
                        components={{ 1: <span className='font-medium' /> }}
                      />
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <p className='text-textSecondary text-center'>
              <Trans i18nKey='packages-ui:waitlistCopyright' values={{ appName, year: new Date().getFullYear() }} />
            </p>
            <div className='flex items-center justify-center gap-2'>
              <Avatar className='bg-neutral/20 bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandGithub className='text-foreground text-lg' />
                </AvatarFallback>
              </Avatar>
              <Avatar className='bg-accent/20 bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandDiscord className='text-accent/100 text-lg' />
                </AvatarFallback>
              </Avatar>
              <Avatar className='bg-info/20 bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandTwitter className='text-info text-lg' />
                </AvatarFallback>
              </Avatar>
              <Avatar color='primary' className='bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandInstagram className='text-lg' />
                </AvatarFallback>
              </Avatar>
              <Avatar color='destructive' className='bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandYoutube className='text-lg' />
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WaitListAdvanced
