// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { SidebarProvider } from '@repo/ui/components/ui/sidebar'
import VerticalLayout from '@repo/ui/layouts/VerticalLayout'

// Component Imports
import Sidebar from '@components/layout/vertical/Sidebar'
import Header from '@components/layout/vertical/Header'

const AdminLayout = async ({ children }: { children: ReactNode }) => {
  // Vars
  const appName = 'App Name'

  return (
    <SidebarProvider>
      <VerticalLayout navigation={<Sidebar roles={[]} appName={appName} />} header={<Header />}>
        {children}
      </VerticalLayout>
    </SidebarProvider>
  )
}

export default AdminLayout
