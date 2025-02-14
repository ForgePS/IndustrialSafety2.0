// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Loader from '@repo/ui/components/Loader'
import Trans from '@repo/i18n/Trans'
import { getAuthUser, getFaq, getFaqCategories } from '@repo/supabase/serverHelpers'

// Component Imports
import Edit from './Edit'
import type { FaqWithCategory } from '../../Faq'

export const metadata: Metadata = {
  title: 'Edit FAQ'
}

const EditFaqSection = async ({ faqId }: { faqId: number }) => {
  const [
    {
      data: { user }
    },
    { data: faqData, error: faqError },
    { data: faqCategory, error: faqCategoryError }
  ] = await Promise.all([getAuthUser(), getFaq(faqId, '*, faq_categories (title)'), getFaqCategories('id, title')])

  if (!faqData || faqError || !faqCategory || faqCategoryError) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans
            i18nKey='admin:faqsEditFetchError'
            values={{ message: faqError?.message || faqCategoryError?.message || 'Unknown error' }}
          />
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Edit
      faqData={faqData as FaqWithCategory}
      categories={faqCategory}
      id={faqId}
      userPermissions={user?.user_metadata.permissions}
    />
  )
}

const EditFaqPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const faqId = Number(params.id)

  return (
    <Suspense fallback={<Loader />}>
      <EditFaqSection faqId={faqId} />
    </Suspense>
  )
}

export default EditFaqPage
