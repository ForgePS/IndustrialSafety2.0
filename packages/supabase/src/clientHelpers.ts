// Util Imports
import { createClient } from '@repo/supabase/client'

export async function getAuthUser() {
  const supabase = createClient()

  const user = await supabase.auth.getUser()

  return user
}

export const getPublicUser = async (column: string = '*') => {
  const supabase = createClient()

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
  const supabase = createClient()

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

export const getPublicGeneralSettings = async () => {
  const supabase = createClient()

  const generalSettingRecord = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'general_settings')
    .single()

  return generalSettingRecord
}

export const getPublicPaymentProvider = async () => {
  const supabase = createClient()

  const paymentProviderRecord = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'payment_provider')
    .single()

  return paymentProviderRecord
}
