'use server'

// Third-party Imports
import type { Database } from '@repo/supabase/types'
import { createServiceRoleClient } from '@repo/supabase/server'

type AssignRolesToUserType = {
  supabase: ReturnType<typeof createServiceRoleClient>
  userId: number
  selectedRoles: string[]
  availableRoles: Database['public']['Tables']['roles']['Row'][]
}

type UsersType = {
  name: string
  email: string
  password?: string
  roles: Database['public']['Tables']['roles']['Row'][]
  selectedRoles: string[]
}

type UsersEditType = UsersType & {
  id: number
}

async function assignRolesToUser({ supabase, userId, selectedRoles, availableRoles }: AssignRolesToUserType) {
  // Create lookup for role names to role IDs
  const roleLookup = availableRoles.reduce(
    (acc, role) => {
      acc[role.role] = role.id

      return acc
    },
    {} as Record<string, number>
  )

  const selectedRoleIds = selectedRoles.map(roleName => roleLookup[roleName]).filter(Boolean)

  // Fetch current roles for the user
  const { data: existingRoles, error: existingRolesError } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)

  if (existingRolesError) throw new Error(`Error fetching existing roles: ${existingRolesError.message}`)

  const existingRoleIds = existingRoles?.map(r => r.role_id) || []

  // Determine roles to add and remove
  const rolesToAdd = selectedRoleIds.filter(id => !existingRoleIds.includes(id))
  const rolesToRemove = existingRoleIds.filter(id => !selectedRoleIds.includes(id))

  // Insert new roles
  if (rolesToAdd.length > 0) {
    const { error } = await supabase.from('user_roles').insert(
      rolesToAdd.map(roleId => ({
        user_id: userId,
        role_id: roleId
      }))
    )

    if (error) throw new Error(`Error adding roles: ${error.message}`)
  }

  // Delete roles that are no longer selected
  if (rolesToRemove.length > 0) {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .match({
        user_id: userId
      })
      .in('role_id', rolesToRemove)

    if (error) throw new Error(`Error removing roles: ${error.message}`)
  }
}

export const createUser = async (data: UsersType) => {
  const supabase = createServiceRoleClient()

  try {
    const { email, password, name, roles, selectedRoles } = data

    // Create the user in Supabase Auth
    return supabase.auth.admin
      .createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, email }
      })
      .then(async authUserResponse => {
        if (!authUserResponse.data?.user) {
          throw new Error(`Error creating user in auth: ${authUserResponse.error?.message}`)
        }

        // Retrieve the sequential user_id from the public.users table
        const { data: publicUser, error: publicUserError } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .single()

        if (publicUserError || !publicUser) {
          throw new Error(`Failed to retrieve user ID from public.users: ${publicUserError?.message}`)
        }

        const sequentialUserId = publicUser.id

        // Assign roles to the user
        await assignRolesToUser({
          supabase,
          userId: sequentialUserId,
          selectedRoles,
          availableRoles: roles
        })

        return { message: 'User created successfully!' }
      })
      .catch(error => {
        console.error('Role assignment failed during user creation:', error.message)

        return { error: `User creation partially failed: ${error.message}` }
      })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during user creation.'

    console.error('Unexpected error:', errorMessage)

    return { error: 'An error occurred. Please try again.' }
  }
}

export async function editUser(data: UsersEditType) {
  const supabase = createServiceRoleClient()

  try {
    const { id, name, email, password, roles, selectedRoles } = data

    // Get the UUID of the user from the public.users table
    const { data: userData, error: userError } = await supabase.from('users').select('user_id').eq('id', id).single()

    if (userError) {
      return { error: `Error fetching user: ${userError.message}` }
    }

    // Get the UUID of the user to update
    const authId = userData?.user_id

    // Update User Information
    await supabase.auth.admin.updateUserById(authId, {
      email,
      ...(password && { password }),
      user_metadata: { email, name }
    })

    // Assign roles to the user
    await assignRolesToUser({
      supabase,
      userId: id,
      selectedRoles,
      availableRoles: roles
    })

    return { message: 'User updated successfully' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred during user update.'

    console.error('User update error:', errorMessage)

    return { error: errorMessage }
  }
}

export async function deleteUser(id: number) {
  const supabase = createServiceRoleClient()

  try {
    // Fetch the UUID of the user to delete
    const { data: userData, error: userError } = await supabase.from('users').select('user_id').eq('id', id).single()

    if (userError) {
      return { error: `Error fetching user: ${userError.message}` }
    }

    // Get the UUID of the user to delete
    const authId = userData?.user_id

    // Delete the user from the 'users' table
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(authId)

    if (deleteUserError) {
      return { error: `Error deleting user: ${deleteUserError.message}` }
    }

    return { message: 'User deleted successfully' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'

    console.error('Unexpected error:', errorMessage)

    return { error: `Unexpected error: ${errorMessage}` }
  }
}
