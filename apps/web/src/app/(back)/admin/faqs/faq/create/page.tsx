// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Create from './Create'

export const metadata: Metadata = {
  title: 'Create FAQ'
}

const CreateSection = async () => {
  // Vars
  const supabase = await createClient()

  const { data, error } = await supabase.from('faq_categories').select('id, title').order('title', { ascending: true })

  if (error) {
    console.error('Error fetching faq categories: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Create categories={data} />
}

const CreatePage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <CreateSection />
    </Suspense>
  )
}

export default CreatePage
