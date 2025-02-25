// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Trans from '@repo/i18n/Trans'

// Component Imports
import { getUserProfile } from './server'
import PersonalInformation from './PersonalInformation'
import Password from './Password'

type UserData = {
  id: string
  email: string
  name: string
  avatarUrl: string
  user_avatar: string
  provider: string
}

const MyProfile = async () => {
  const { data, error } = await getUserProfile()

  if (error) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans i18nKey='packages-profile:errorFetchingProfile' values={{ message: error.message }} />
        </AlertDescription>
      </Alert>
    )
  }

  const userData: UserData = {
    id: data?.user?.id || '',
    email: data?.user?.email || '',
    name: data?.user?.user_metadata?.name || '',
    avatarUrl: data?.user?.user_metadata?.avatar_url || '',
    user_avatar: data?.user?.user_metadata?.user_avatar || '',
    provider: data?.user?.app_metadata?.provider || ''
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <div>
        <h1 className='mbe-2 text-textPrimary text-2xl font-bold sm:text-3xl'>
          <Trans i18nKey='packages-profile:myProfileTitle' />
        </h1>
        <p className='text-textSecondary text-lg'>
          <Trans i18nKey='packages-profile:myProfileDescription' />
        </p>
      </div>
      <section className='space-b-6 divide-b divide-border'>
        <PersonalInformation userData={userData} />
        <Password />
      </section>
    </div>
  )
}

export default MyProfile
