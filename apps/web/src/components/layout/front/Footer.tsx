// Next Imports
import Link from 'next/link'

// Third-party Imports
import * as Icons from 'react-icons/tb'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { cn } from '@repo/ui/lib/utils'
import { getPublicGeneralSettings } from '@repo/supabase/serverHelpers'
import frontCommonStyles from '@repo/ui/blocks/styles.module.css'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Component Imports
import Logo from './Logo'

// Util Imports
import { getAppName } from '@/utils/getAppName'

// To render dynamic icons
type DynamicIconProps = {
  icon: keyof typeof Icons
}

export const DynamicIcon = ({ icon }: DynamicIconProps) => {
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
            Empowering businesses with intelligent customer support solutions. ©2024 ChatFlow AI. All rights reserved.
          </p>
          <p className='text-textSecondary text-base'>
            Crafted with ❤️️ by{' '}
            <Link href='https://themeselection.com' target='_blank' className='text-primary font-semibold'>
              ThemeSelection
            </Link>
          </p>
          {socialLinks.length ? (
            <div className='flex items-center gap-2'>
              {socialLinks.map((link, index) => (
                <Link href={link.url} target='_blank' key={index}>
                  <Avatar color='secondary' size='md'>
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
          <h6 className='text-textPrimary mbe-4 text-lg font-semibold'>About</h6>
          <ul className='flex flex-col gap-4'>
            <li>
              <Link href='/#pricing-section' className='link-animated text-textPrimary text-base'>
                Pricing
              </Link>
            </li>
            <li>
              <Link href='/faqs' className='link-animated text-textPrimary text-base'>
                FAQs
              </Link>
            </li>
            <li>
              <Link href='/#reviews-section' className='link-animated text-textPrimary text-base'>
                Reviews
              </Link>
            </li>
            <li>
              <Link href='/' className='link-animated text-textPrimary text-base'>
                Contact Us
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h6 className='text-textPrimary mbe-4 text-lg font-semibold'>Resources</h6>
          <ul className='flex flex-col gap-4'>
            <li>
              <Link href='/' className='link-animated text-textPrimary text-base'>
                Documentation
              </Link>
            </li>
            <li>
              <Link href='/changelog' className='link-animated text-textPrimary text-base'>
                Changelog
              </Link>
            </li>
            <li>
              <Link href='/' className='link-animated text-textPrimary text-base'>
                Discord Community
              </Link>
            </li>
            {isBlogEnabled && (
              <li>
                <Link href='/blog' className='link-animated text-textPrimary text-base'>
                  Blog
                </Link>
              </li>
            )}
          </ul>
        </div>
        <div>
          <h6 className='text-textPrimary mbe-4 text-lg font-semibold'>Collaboration</h6>
          <ul className='flex flex-col gap-4'>
            <li>
              <Link href='/' className='link-animated text-textPrimary text-base'>
                Affiliates (up to $75) per sale
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h6 className='text-textPrimary mbe-4 text-lg font-semibold'>Legal</h6>
          <ul className='flex flex-col gap-4'>
            <li>
              <Link href='/' className='link-animated text-textPrimary text-base'>
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href='/' className='link-animated text-textPrimary text-base'>
                Privacy & Legal
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}

export default Footer
