// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'

// Component Imports
import Create from './Create'

const CreatePage = async () => {
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

export default CreatePage
