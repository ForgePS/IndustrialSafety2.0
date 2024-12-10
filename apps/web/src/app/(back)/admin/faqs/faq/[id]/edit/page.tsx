// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { createClient } from '@repo/supabase/server'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'

// Component Imports
import Edit from './Edit'
import type { FaqWithCategory } from '../../Faq'

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

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
          {`There was an error fetching the faq. Error: ${faqError?.message || faqCategoryError?.message || 'Unknown error'}`}
        </AlertDescription>
      </Alert>
    )
  }

  return <Edit faqData={faqData as FaqWithCategory} categories={faqCategory} id={faqId} />
}

export default EditPage
