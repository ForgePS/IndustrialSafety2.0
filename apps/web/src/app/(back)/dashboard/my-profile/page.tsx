// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import MyProfilePage from '@repo/profile/page'

export const metadata: Metadata = {
  title: 'My Profile'
}

const ProfilePage = () => {
  return <MyProfilePage />
}

export default ProfilePage
