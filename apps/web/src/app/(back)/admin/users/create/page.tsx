// Third-party Imports
import { createClient } from '@repo/supabase/server'

// Component Imports
import Create from './Create'

const CreatePage = async () => {
  // Vars
  const supabase = await createClient()

  // Fetch roles data
  const { data: rolesData, error: rolesError } = await supabase.from('roles').select('*')

  if (rolesError) {
    console.error('Error fetching roles data:', rolesError.message)

    return null
  }

  return <Create roles={rolesData} />
}

export default CreatePage
