// Next Imports
import Image from 'next/image'

// Third-party Imports
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/ui/avatar'
import { getAuthUser, getPublicUser } from '@repo/supabase/serverHelpers'
import { getInitials } from '@repo/ui/utils/getInitials'

// Component Imports
import SignOutButton from './SignOutButton'

const DashboardPage = async () => {
  // Vars
  const {
    data: { user }
  } = await getAuthUser()

  const { data: userRecord } = await getPublicUser()
  const userName = userRecord.name || user?.user_metadata.name || user?.email
  const avatarFallbackText = getInitials(userName).toUpperCase()
  const avatarSrc = user?.user_metadata.user_avatar || user?.user_metadata.avatar_url

  return (
    <Card>
      <CardContent className='pbs-6 flex items-center justify-between'>
        <div className='flex items-center gap-x-3'>
          <Avatar shape='circle'>
            <AvatarImage asChild src={avatarSrc}>
              <Image alt={userName} src={avatarSrc} priority quality={100} height={36} width={36} />
            </AvatarImage>
            <AvatarFallback>{avatarFallbackText}</AvatarFallback>
          </Avatar>
          <div className='flex flex-col items-start'>
            <p className='text-base font-semibold'>Welcome</p>
            <p className='text-textDisabled text-sm'>{userName}</p>
          </div>
        </div>
        <SignOutButton />
      </CardContent>
    </Card>
  )
}

export default DashboardPage
