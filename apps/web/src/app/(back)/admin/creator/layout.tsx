// React Imports
import type { ReactNode } from 'react'

// Lib Imports
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const ForgeCreatorLayout = async ({ children }: { children: ReactNode }) => {
  await requireForgePlatformRole()

  return children
}

export default ForgeCreatorLayout
