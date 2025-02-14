// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { getAuthUser, getFaqs } from '@repo/supabase/serverHelpers'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Faq from './Faq'

export const metadata: Metadata = {
  title: 'FAQs'
}

const FaqSection = async () => {
  const [
    {
      data: { user }
    },
    { data, error }
  ] = await Promise.all([getAuthUser(), getFaqs('*, faq_categories (title)')])

  if (error) {
    console.error('Error fetching faqs: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Faq faqData={data} userPermissions={user?.user_metadata.permissions} />
}

const FaqPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <FaqSection />
    </Suspense>
  )
}

export default FaqPage
