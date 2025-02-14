// React Imports
import { Suspense } from 'react'

// Next Imports
import Image from 'next/image'
import type { Metadata } from 'next'

// Third-party Imports
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/ui/avatar'
import { getAuthUser } from '@repo/supabase/serverHelpers'
import { getInitials } from '@repo/ui/utils/getInitials'
import Loader from '@repo/ui/components/Loader'
import Trans from '@repo/i18n/Trans'

// Component Imports
import SignOutButton from './SignOutButton'

export const metadata: Metadata = {
  title: 'Dashboard'
}

const DashboardPage = async () => {
  // Vars
  const {
    data: { user }
  } = await getAuthUser()

  const userName = user?.user_metadata.name || user?.email
  const avatarFallbackText = getInitials(userName).toUpperCase()
  const avatarSrc = user?.user_metadata.user_avatar || user?.user_metadata.avatar_url

  return (
    <Suspense fallback={<Loader />}>
      <div className='flex flex-col gap-y-8'>
        <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
          <Trans i18nKey='dashboard:dashboardTitle' />
        </h1>
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
                <p className='text-base font-semibold'>
                  <Trans i18nKey='dashboard:welcomeText' />
                </p>
                <p className='text-textDisabled text-sm'>{userName}</p>
              </div>
            </div>
            <SignOutButton />
          </CardContent>
        </Card>
      </div>
    </Suspense>
  )
}

export default DashboardPage
