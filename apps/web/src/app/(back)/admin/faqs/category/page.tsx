// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getAuthUser, getFaqCategories } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Categories from './Categories'

export const metadata: Metadata = {
  title: 'FAQ Categories'
}

const FaqCategoriesSection = async () => {
  const [
    {
      data: { user }
    },
    { data, error }
  ] = await Promise.all([getAuthUser(), getFaqCategories()])

  if (error) {
    console.error('Error fetching categories: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Categories categoryData={data} userPermissions={user?.user_metadata.permissions} />
}

const FaqCategoriesPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <FaqCategoriesSection />
    </Suspense>
  )
}

export default FaqCategoriesPage
