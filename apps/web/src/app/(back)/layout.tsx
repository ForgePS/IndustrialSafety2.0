// React Imports
import type { ReactNode } from 'react'

// Next Imports
import { cookies } from 'next/headers'
import type { Metadata } from 'next'

// Third-party Imports
import { SidebarProvider } from '@repo/ui/components/ui/sidebar'
import VerticalLayout from '@repo/ui/layouts/VerticalLayout'
import { getAuthUser } from '@repo/supabase/serverHelpers'
import { getPublicGeneralSettings } from '@repo/supabase/clientHelpers'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Component Imports
import Sidebar from '@components/layout/vertical/Sidebar'
import Header from '@components/layout/vertical/Header'
import { getAppName } from '@/utils/getAppName'

// Config Imports
import appConfig from '@configs/appConfig'

export async function generateMetadata(): Promise<Metadata> {
  const { data: settingsData, error } = await getPublicGeneralSettings()

  if (error) {
    console.error(error)
  }

  let appName

  if (settingsData) {
    const settings = JSON.parse(settingsData.value) as SettingsConfiguration['general_settings']

    appName = settings.application?.site_name
  }

  return {
    title: appName
      ? {
          template: `%s | ${appName} - Next.js Boilerplate PRO`,
          default: `${appName} - Next.js Boilerplate PRO`
        }
      : {
          template: '%s | ChatFlow AI - Next.js Boilerplate PRO',
          default: 'ChatFlow AI - Next.js Boilerplate PRO'
        },
    alternates: {
      canonical: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo'
    }
  }
}

const AdminLayout = async ({ children }: { children: ReactNode }) => {
  // Vars
  const appName = await getAppName()
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get('is-sidebar-open')

  const {
    data: { user }
  } = await getAuthUser()

  const roles = user?.user_metadata.roles
  const permissions = user?.user_metadata.permissions

  return (
    <SidebarProvider defaultOpen={sidebarCookie ? JSON.parse(sidebarCookie.value) : appConfig.layout === 'vertical'}>
      <VerticalLayout
        navigation={<Sidebar roles={roles} permissions={permissions} appName={appName} />}
        header={<Header />}
      >
        {children}
      </VerticalLayout>
    </SidebarProvider>
  )
}

export default AdminLayout
