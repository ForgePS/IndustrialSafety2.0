// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { createClient } from '@repo/supabase/server'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Trans from '@repo/i18n/Trans'
import { getAuthUser } from '@repo/supabase/serverHelpers'

// Component Imports
import Edit from './Edit'
import type { FaqWithCategory } from '../../Faq'

export const metadata: Metadata = {
  title: 'Edit FAQ'
}

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const faqId = Number(params.id)

  // Fetch faq data
  const { data: faqData, error: faqError } = await supabase
    .from('faqs')
    .select(
      `
    *,
    faq_categories (title)
  `
    )
    .eq('id', faqId)
    .single()

  // Fetch faq categories
  const { data: faqCategory, error: faqCategoryError } = await supabase
    .from('faq_categories')
    .select('id, title')
    .order('id', { ascending: true })

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

export default EditPage
