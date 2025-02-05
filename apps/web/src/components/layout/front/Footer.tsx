// Next Imports
import Link from 'next/link'

// Third-party Imports
import * as Icons from 'react-icons/tb'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { cn } from '@repo/ui/lib/utils'
import { getPublicGeneralSettings } from '@repo/supabase/serverHelpers'
import frontCommonStyles from '@repo/ui/blocks/styles.module.css'
import Trans from '@repo/i18n/Trans'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Component Imports
import Logo from './Logo'

// Util Imports
import { getAppName } from '@/utils/getAppName'

// To render dynamic icons
type DynamicIconProps = {
  icon: keyof typeof Icons
}

const DynamicIcon = ({ icon }: DynamicIconProps) => {
  // eslint-disable-next-line import/namespace
  const IconComponent = Icons[icon]

  if (!IconComponent) return null

  return <IconComponent className='text-lg' />
}

const Footer = async () => {
  // Vars
  const appName = await getAppName()

  const { data: settingsData, error } = await getPublicGeneralSettings()

  if (error) {
    console.error('Error fetching settings: ', error.message)
  }

  let socialLinks: { title: string; icon: keyof typeof Icons; url: string }[] = []
  let isBlogEnabled = null

  if (settingsData) {
    const settings = JSON.parse(settingsData.value) as SettingsConfiguration['general_settings']

    isBlogEnabled = settings.pages_components.blog_enabled

    socialLinks = settings.social_links.map(link => ({
      ...link,
      icon: link.icon as keyof typeof Icons
    }))
  }

  return (
    <footer className='is-full bg-card'>
      <div className={cn('plb-8 md:plb-[60px] grid grid-cols-2 gap-8 md:grid-cols-6', frontCommonStyles.layoutSpacing)}>
        <div className='col-span-2 flex flex-col gap-6'>
          <Link href='/'>
            <Logo appName={appName} />
          </Link>
          <p className='text-textSecondary text-base'>
            <Trans i18nKey='layout:copyrightText' values={{ year: new Date().getFullYear() }} />
          </p>
          <p className='text-textSecondary text-base'>
            <Trans
              i18nKey='layout:craftedWithLove'
              components={{
                1: <Link href='https://themeselection.com' target='_blank' className='text-primary font-semibold' />
              }}
            />
          </p>
          {socialLinks.length ? (
            <div className='flex items-center gap-2'>
              {socialLinks.map((link, index) => (
                <Link href={link.url} target='_blank' key={index}>
                  <Avatar color='secondary' size='md' className='bs-[30px] is-[30px]'>
                    <AvatarFallback>
                      <DynamicIcon icon={link.icon} />
                    </AvatarFallback>
                  </Avatar>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <h6 className='text-textPrimary mbe-4 text-lg font-semibold'>
            <Trans i18nKey='layout:about' />
          </h6>
          <ul className='flex flex-col gap-4'>
            <li>
              <Link href='/#pricing-section' className='link-animated text-textPrimary text-base'>
                <Trans i18nKey='layout:pricingLabel' />
              </Link>
            </li>
            <li>
              <Link href='/faqs' className='link-animated text-textPrimary text-base'>
                <Trans i18nKey='layout:faqs' />
              </Link>
            </li>
            <li>
              <Link href='/#reviews-section' className='link-animated text-textPrimary text-base'>
                <Trans i18nKey='layout:reviews' />
              </Link>
            </li>
            <li>
              <Link
                href='https://themeselection.com/contact-us'
                target='_blank'
                className='link-animated text-textPrimary text-base'
              >
                <Trans i18nKey='layout:contactUs' />
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h6 className='text-textPrimary mbe-4 text-lg font-semibold'>
            <Trans i18nKey='layout:resources' />
          </h6>
          <ul className='flex flex-col gap-4'>
            <li>
              <Link href='/' target='_blank' className='link-animated text-textPrimary text-base'>
                <Trans i18nKey='layout:documentation' />
              </Link>
            </li>
            <li>
              <Link href='/changelog' className='link-animated text-textPrimary text-base'>
                <Trans i18nKey='layout:changelog' />
              </Link>
            </li>
            <li>
              <Link
                href='https://discord.com/invite/kBHkY7DekX'
                target='_blank'
                className='link-animated text-textPrimary text-base'
              >
                <Trans i18nKey='layout:discordCommunity' />
              </Link>
            </li>
            {isBlogEnabled && (
              <li>
                <Link href='/blog' className='link-animated text-textPrimary text-base'>
                  <Trans i18nKey='layout:blog' />
                </Link>
              </li>
            )}
          </ul>
        </div>
        <div>
          <h6 className='text-textPrimary mbe-4 text-lg font-semibold'>
            <Trans i18nKey='layout:collaboration' />
          </h6>
          <ul className='flex flex-col gap-4'>
            <li>
              <Link href='/' target='_blank' className='link-animated text-textPrimary text-base'>
                <Trans i18nKey='layout:affiliatesUpToPerSale' />
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h6 className='text-textPrimary mbe-4 text-lg font-semibold'>
            <Trans i18nKey='layout:legal' />
          </h6>
          <ul className='flex flex-col gap-4'>
            <li>
              <Link href='/terms-of-service' className='link-animated text-textPrimary text-base'>
                <Trans i18nKey='layout:termsOfService' />
              </Link>
            </li>
            <li>
              <Link href='/privacy-policy' className='link-animated text-textPrimary text-base'>
                <Trans i18nKey='layout:privacyAndLegal' />
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}

export default Footer
