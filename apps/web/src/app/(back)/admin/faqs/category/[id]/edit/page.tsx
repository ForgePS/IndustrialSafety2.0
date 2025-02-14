// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-Party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Loader from '@repo/ui/components/Loader'
import Trans from '@repo/i18n/Trans'
import { getAuthUser, getFaqCategory } from '@repo/supabase/serverHelpers'

// Component Imports
import Edit from './Edit'

export const metadata: Metadata = {
  title: 'Edit FAQ Category'
}

const EditCategorySection = async ({ categoryId }: { categoryId: number }) => {
  // Vars
  const [
    {
      data: { user }
    },
    { data, error }
  ] = await Promise.all([getAuthUser(), getFaqCategory(categoryId)])

  if (!data || error) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans i18nKey='admin:faqCategoriesEditFetchError' values={{ message: error?.message || 'Unknown error' }} />
        </AlertDescription>
      </Alert>
    )
  }

  return <Edit categoryData={data} id={categoryId} userPermissions={user?.user_metadata.permissions} />
}

const EditCategoryPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const categoryId = Number(params.id)

  return (
    <Suspense fallback={<Loader />}>
      <EditCategorySection categoryId={categoryId} />
    </Suspense>
  )
}

export default EditCategoryPage
