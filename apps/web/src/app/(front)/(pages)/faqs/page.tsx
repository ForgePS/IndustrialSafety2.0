// Third-Party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'

// Components Imports
import Details from './Details'
import HeaderSection from './HeaderSection'

const FaqPage = async () => {
  // Vars
  const supabase = await createClient()

  const { data: categoryData, error: categoryError } = await supabase
    .from('faq_categories')
    .select('*')
    .order('id', { ascending: true })

  const { data: faqData, error: faqError } = await supabase.from('faqs').select('*').order('id', { ascending: true })

  return (
    <>
      <HeaderSection />
      {categoryError || faqError ? (
        <div className='is-full bs-32 flex items-center justify-center'>
          <Alert variant='destructive' className='!is-[90%] sm:!is-[80%] md:!is-[70%] lg:!is-2/4 mlb-8'>
            <TbExclamationCircle className='bs-5 is-5' />
            <AlertDescription>
              {`There was an error fetching the data. Error: ${categoryError?.message || faqError?.message || 'Unknown error'}`}
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <Details categoryData={categoryData} faqData={faqData} />
      )}
    </>
  )
}

export default FaqPage
