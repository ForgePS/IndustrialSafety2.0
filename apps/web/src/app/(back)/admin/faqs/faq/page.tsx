// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { createClient } from '@repo/supabase/server'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getAuthUser } from '@repo/supabase/serverHelpers'

// Component Imports
import Faq from './Faq'

export const metadata: Metadata = {
  title: 'FAQs'
}

const FaqPage = async () => {
  // Vars
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const { data, error } = await supabase
    .from('faqs')
    .select(
      `
    *,
    faq_categories (title)
  `
    )
    .order('id', { ascending: true })

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

export default FaqPage
