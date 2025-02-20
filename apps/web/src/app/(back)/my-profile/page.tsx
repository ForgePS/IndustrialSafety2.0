// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import Loader from '@repo/ui/components/Loader'

// Component Imports
import MyProfilePage from './MyProfilePage'

export const metadata: Metadata = {
  title: 'My Profile'
}

const ProfilePage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <MyProfilePage />
    </Suspense>
  )
}

export default ProfilePage
