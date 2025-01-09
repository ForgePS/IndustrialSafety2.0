// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { createClient } from '@repo/supabase/server'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'

// Component Imports
import EditPlatform from './Edit'

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  const { data, error } = await supabase.from('review_platforms').select().eq('id', params.id).single()

  if (!data || error) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          {`There was an error fetching the review platforms. Error: ${error?.message || 'Unknown error'}`}
        </AlertDescription>
      </Alert>
    )
  }

  return <EditPlatform platformData={data} id={params.id} />
}

export default EditPage
