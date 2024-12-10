// React Imports
import type { ReactNode } from 'react'

// Next Imports
import { cookies } from 'next/headers'

// Third-party Imports
import { SidebarProvider } from '@repo/ui/components/ui/sidebar'
import VerticalLayout from '@repo/ui/layouts/VerticalLayout'
import { getUserRoles } from '@repo/supabase/serverHelpers'

// Component Imports
import Sidebar from '@components/layout/vertical/Sidebar'
import Header from '@components/layout/vertical/Header'
import { getAppName } from '@/utils/getAppName'

// Config Imports
import appConfig from '@configs/appConfig'

const AdminLayout = async ({ children }: { children: ReactNode }) => {
  // Vars
  const appName = await getAppName()
  const { data: userRoles } = await getUserRoles()
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get('is-sidebar-open')

  const roles: string[] | undefined = userRoles?.map(role => role.roles.role)

  return (
    <SidebarProvider defaultOpen={sidebarCookie ? JSON.parse(sidebarCookie.value) : appConfig.layout === 'vertical'}>
      <VerticalLayout navigation={<Sidebar roles={roles} appName={appName} />} header={<Header />}>
        {children}
      </VerticalLayout>
    </SidebarProvider>
  )
}

export default AdminLayout
