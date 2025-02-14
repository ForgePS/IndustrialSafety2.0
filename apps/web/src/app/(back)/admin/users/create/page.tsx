// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { getRoles } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Create from './Create'

export const metadata: Metadata = {
  title: 'Create User'
}

const CreateUserSection = async () => {
  // Vars
  const { data: rolesData, error: rolesError } = await getRoles()

  if (rolesError) {
    console.error('Error fetching roles data:', rolesError.message)

    return null
  }

  return <Create roles={rolesData} />
}

const CreateUserPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <CreateUserSection />
    </Suspense>
  )
}

export default CreateUserPage
