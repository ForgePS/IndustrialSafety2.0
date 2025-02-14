// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import MyProfilePage from '@repo/profile/page'
import Loader from '@repo/ui/components/Loader'

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
