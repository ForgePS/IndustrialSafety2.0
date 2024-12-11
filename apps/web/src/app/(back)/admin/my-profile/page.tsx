// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getUserProfile } from '@repo/profile/server'

// Component Imports
import PersonalInformation from './PersonalInformation'
import Password from './Password'

type UserData = {
  id: string
  email: string
  name: string
  avatarUrl: string
  user_avatar: string
}

const MyProfile = async () => {
  const { data, error } = await getUserProfile()

  if (error) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{`There was an error fetching the profile data. Error: ${error.message}`}</AlertDescription>
      </Alert>
    )
  }

  const userData: UserData = {
    id: data?.user?.id || '',
    email: data?.user?.email || '',
    name: data?.user?.user_metadata?.name || '',
    avatarUrl: data?.user?.user_metadata?.avatar_url || '',
    user_avatar: data?.user?.user_metadata?.user_avatar || ''
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <header>
        <h1 className='text-textPrimary text-3xl font-bold'>My Profile</h1>
        <p className='text-textSecondary mbs-2 text-lg'>Manage your user profile here.</p>
      </header>
      <section className='space-b-6 divide-b divide-border'>
        <PersonalInformation userData={userData} />
        <Password />
      </section>
    </div>
  )
}

export default MyProfile
