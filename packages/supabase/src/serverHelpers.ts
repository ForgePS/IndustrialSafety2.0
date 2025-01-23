// Third-party Imports
import { jwtDecode } from 'jwt-decode'
import type { JwtPayload } from 'jwt-decode'
import type { UserResponse } from '@supabase/supabase-js'

// Util Imports
import { createClient, createServiceRoleClient } from '@repo/supabase/server'

type JWT = JwtPayload & {
  roles: string[]
  permissions: string[]
}

export async function getAuthUser(): Promise<UserResponse> {
  const supabase = await createClient()

  const {
    data: { session }
  } = await supabase.auth.refreshSession()

  const user = await supabase.auth.getUser()

  if (user.data.user && session) {
    const supabaseServiceRole = createServiceRoleClient()

    const jwt: JWT = jwtDecode(session.access_token)

    const updatedUser = await supabaseServiceRole.auth.admin.updateUserById(user.data.user.id, {
      user_metadata: {
        ...user.data.user.user_metadata,
        roles: jwt.roles,
        permissions: jwt.permissions
      }
    })

    return updatedUser
  }

  return user
}

export const getPublicUser = async (column: string = '*') => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const userRecord = await supabase
    .from('users')
    .select(column as '*')
    .eq('user_id', user?.id)
    .single()

  return userRecord
}

export const getUserPermissions = async (): Promise<string[] | undefined> => {
  const supabase = await createClient()

  const { data: publicUser } = await getPublicUser()

  const { data: userRoles } = await supabase
    .from('user_roles')
    .select(
      `
      *,
      roles (
        role,
        role_permissions (
          permissions (
            permission
          )
        )
      )
    `
    )
    .eq('user_id', publicUser.id)

  const permissions = [
    ...new Set(
      userRoles?.flatMap(({ roles }) =>
        roles.role_permissions.flatMap(
          ({ permissions }: { permissions: { permission: string } }) => permissions.permission
        )
      )
    )
  ]

  return permissions
}

export const getUserRoles = async (): Promise<string[] | undefined> => {
  const {
    data: { user }
  } = await getAuthUser()

  return user?.user_metadata.roles
}

export const getPublicGeneralSettings = async () => {
  const supabase = await createClient()

  const generalSettingRecord = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'general_settings')
    .single()

  return generalSettingRecord
}

export const getPublicPaymentProvider = async () => {
  const supabase = await createClient()

  const paymentProviderRecord = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'payment_provider')
    .single()

  return paymentProviderRecord
}

export const getBillingRecords = async (column: string = '*') => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const billingRecord = await supabase
    .from('billing')
    .select(column as '*')
    .eq('user_id', user?.id)
    .order('id', { ascending: true })

  return billingRecord
}
