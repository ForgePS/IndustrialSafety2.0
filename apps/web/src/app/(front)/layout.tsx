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
    keywords: ['industrial safety', 'EHS software', 'incident management', 'safety inspections', 'lockout tagout'],
    openGraph: {
      title: appName,
      description: description,
      ...(process.env.NEXT_PUBLIC_APP_URL ? { url: process.env.NEXT_PUBLIC_APP_URL } : {})
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
