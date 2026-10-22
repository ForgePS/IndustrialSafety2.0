// React Imports
import type { ReactNode } from 'react'

// Next Imports
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
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
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveExperience } from '@/lib/forgeExperience'
import { getHelpdeskStaffAccess } from '@/lib/forgeHelpdeskAccess'

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

  if (!user) redirect('/auth/login')

  const roles = user.user_metadata?.roles
  const permissions = user.user_metadata?.permissions
  const forgePlatformRole = await getForgePlatformRole(user.id)
  const tenantContext = await getTenantContext()
  const helpdeskStaff = forgePlatformRole ? await getHelpdeskStaffAccess() : null

  const tenantNavigation =
    tenantContext.user && tenantContext.activeOrganization
      ? await getEffectiveExperience({
          organizationId: tenantContext.activeOrganization.id,
          userId: tenantContext.user.id,
          types: ['menu']
        })
      : []

  return (
    <SidebarProvider defaultOpen={sidebarCookie ? JSON.parse(sidebarCookie.value) : appConfig.layout === 'vertical'}>
      <VerticalLayout
        navigation={
          <Sidebar
            roles={roles}
            permissions={permissions}
            forgePlatformRole={forgePlatformRole}
            tenantNavigation={tenantNavigation.filter(item => item.routeLive)}
            activeOrganizationName={tenantContext.activeOrganization?.name || null}
            helpdeskConsole={Boolean(helpdeskStaff?.has('helpdesk.support.view'))}
          />
        }
        header={
          <Header
            organizations={tenantContext.organizations}
            activeOrganizationId={tenantContext.activeOrganization?.id || null}
          />
        }
      >
        {children}
      </VerticalLayout>
    </SidebarProvider>
  )
}

export default AdminLayout
