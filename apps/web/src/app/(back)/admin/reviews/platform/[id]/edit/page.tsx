// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { getAuthUser, getReviewPlatform } from '@repo/supabase/serverHelpers'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Loader from '@repo/ui/components/Loader'
import Trans from '@repo/i18n/Trans'

// Component Imports
import EditPlatform from './Edit'

export const metadata: Metadata = {
  title: 'Edit Review Platform'
}

const EditPlatformSection = async ({ platformId }: { platformId: number }) => {
  // Vars
  const [
    {
      data: { user }
    },
    { data, error }
  ] = await Promise.all([getAuthUser(), getReviewPlatform(platformId)])

  if (!data || error) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans
            i18nKey='admin:reviewPlatformsEditPageFetchError'
            values={{ message: error?.message || 'Unknown error' }}
          />
        </AlertDescription>
      </Alert>
    )
  }

  return <EditPlatform platformData={data} id={platformId} userPermissions={user?.user_metadata.permissions} />
}

const EditPlatformPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const platformId = Number(params.id)

  return (
    <Suspense fallback={<Loader />}>
      <EditPlatformSection platformId={platformId} />
    </Suspense>
  )
}

export default EditPlatformPage
