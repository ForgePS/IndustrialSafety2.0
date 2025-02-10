// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'

// Component Imports
import Categories from './Categories'

export const metadata: Metadata = {
  title: 'FAQ Categories'
}

const FaqCategoriesPage = async () => {
  // Vars
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const { data, error } = await supabase.from('faq_categories').select('*').order('id', { ascending: true })

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

export default FaqCategoriesPage
