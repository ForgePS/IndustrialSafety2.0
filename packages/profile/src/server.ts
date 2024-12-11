// Third-party Imports
import { createClient } from '@repo/supabase/server'

// Get the user profile
export const getUserProfile = async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  return { data, error }
}
