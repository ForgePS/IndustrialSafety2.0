// Third-Party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'

// Component Imports
import Edit from './Edit'

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  const categoryId = Number(params.id)

  const { data, error } = await supabase.from('faq_categories').select().eq('id', categoryId).single()

  if (!data || error) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          {`There was an error fetching the category. Error: ${error?.message || 'Unknown error'}`}
        </AlertDescription>
      </Alert>
    )
  }

  return <Edit categoryData={data} id={categoryId} />
}

export default EditPage
