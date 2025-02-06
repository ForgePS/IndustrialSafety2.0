// Third-Party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'
import Trans from '@repo/i18n/Trans'
import { getAuthUser } from '@repo/supabase/serverHelpers'

// Component Imports
import Edit from './Edit'

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const categoryId = Number(params.id)

  const { data, error } = await supabase.from('faq_categories').select().eq('id', categoryId).single()

  if (!data || error) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans i18nKey='admin:faqCategoriesEditFetchError' values={{ message: error?.message || 'Unknown error' }} />
        </AlertDescription>
      </Alert>
    )
  }

  return <Edit categoryData={data} id={categoryId} userPermissions={user?.user_metadata.permissions} />
}

export default EditPage
