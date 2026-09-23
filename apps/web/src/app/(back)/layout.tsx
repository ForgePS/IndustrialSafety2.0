// React Imports
import type { ReactNode } from 'react'

// Next Imports
import { cookies } from 'next/headers'
import type { Metadata } from 'next'

// Third-party Imports
import { SidebarProvider } from '@repo/ui/components/ui/sidebar'
import VerticalLayout from '@repo/ui/layouts/VerticalLayout'
import { getAuthUser } from '@repo/supabase/serverHelpers'

// Component Imports
import Sidebar from '@components/layout/vertical/Sidebar'
import Header from '@components/layout/vertical/Header'

// Config Imports
import appConfig from '@configs/appConfig'

// Lib Imports
import { getForgePlatformRole } from '@/lib/forgeCreatorAuth'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      template: `%s | ${appConfig.appName}`,
      default: appConfig.appName
    }
  }
}

const AdminLayout = async ({ children }: { children: ReactNode }) => {
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get('is-sidebar-open')

  const {
    data: { user }
  } = await getAuthUser()

  const roles = user?.user_metadata.roles
  const permissions = user?.user_metadata.permissions
  const forgePlatformRole = await getForgePlatformRole(user?.id)

  return (
    <SidebarProvider defaultOpen={sidebarCookie ? JSON.parse(sidebarCookie.value) : appConfig.layout === 'vertical'}>
      <VerticalLayout
        navigation={<Sidebar roles={roles} permissions={permissions} forgePlatformRole={forgePlatformRole} />}
        header={<Header />}
      >
        {children}
      </VerticalLayout>
    </SidebarProvider>
  )
}

export default AdminLayout
