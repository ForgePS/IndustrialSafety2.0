// React Imports
import type { ReactNode } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import BlankLayout from '@repo/ui/layouts/BlankLayout'

// Config Imports
import appConfig from '@configs/appConfig'

export async function generateMetadata(): Promise<Metadata> {
  const appName = appConfig.appName
  const title = appConfig.title
  const description = appConfig.description

  return {
    title: title.includes('%s')
      ? {
          template: title,
          default: title.replace('%s | ', '').replace('%s - ', '').replace('%s : ', '').replace('%s ', '')
        }
      : title,
    description: description,
    keywords: [
      'chatflow ai demo',
      'nextjs saas starter kit demo',
      'nextjs saas boilerplate demo',
      'nextjs starter kit demo',
      'nextjs boilerplate demo'
    ],
    openGraph: {
      title: appName,
      description: description,
      url: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo'
    },
    twitter: {
      card: 'summary_large_image',
      title: appName,
      description: description
    }
  }
}

const Layout = ({ children }: { children: ReactNode }) => {
  return <BlankLayout>{children}</BlankLayout>
}

export default Layout
