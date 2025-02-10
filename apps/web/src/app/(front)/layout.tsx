// React Imports
import type { ReactNode } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import BlankLayout from '@repo/ui/layouts/BlankLayout'
import { getPublicGeneralSettings } from '@repo/supabase/clientHelpers'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

export async function generateMetadata(): Promise<Metadata> {
  const { data: settingsData, error } = await getPublicGeneralSettings()

  if (error) {
    console.error(error)
  }

  let appName
  let title
  let description

  if (settingsData) {
    const settings = JSON.parse(settingsData.value) as SettingsConfiguration['general_settings']

    appName = settings.application?.site_name
    title = settings.application?.title
    description = settings.application?.description
  }

  return {
    title: title
      ? title.includes('%s')
        ? { template: title, default: title.replace('%s | ', '').replace('%s ', '') }
        : title
      : appName
        ? {
            template: `%s | ${appName} - Next.js Boilerplate PRO - Tailwind CSS + Shadcn`,
            default: `${appName} - Next.js Boilerplate PRO - Tailwind CSS + Shadcn`
          }
        : {
            template: '%s | ChatFlow AI - Next.js Boilerplate PRO - Tailwind CSS + Shadcn',
            default: 'ChatFlow AI - Next.js Boilerplate PRO - Tailwind CSS + Shadcn'
          },
    description: description
      ? description
      : 'Automate customer support with ChatFlow AI. Resolve queries 24/7, and deliver seamless service using an all-in-one AI chatbot solution.',
    keywords: [
      'chatflow ai demo',
      'nextjs saas starter kit demo',
      'nextjs saas boilerplate demo',
      'nextjs starter kit demo',
      'nextjs boilerplate demo'
    ],
    openGraph: {
      title: 'ChatFlow AI',
      description:
        'Automate customer support with ChatFlow AI. Resolve queries 24/7, and deliver seamless service using an all-in-one AI chatbot solution.',
      url: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo'
    },
    twitter: {
      card: 'summary_large_image',
      title: 'ChatFlow AI',
      description:
        'Automate customer support with ChatFlow AI. Resolve queries 24/7, and deliver seamless service using an all-in-one AI chatbot solution.'
    }
  }
}

const Layout = ({ children }: { children: ReactNode }) => {
  return <BlankLayout>{children}</BlankLayout>
}

export default Layout
