// Third-party Imports
import { createClient } from '@repo/supabase/client'

export const uploadAvatarToSupabase = async (file: File) => {
  const supabase = await createClient()

  if (!file || !file.name) {
    console.error('Invalid file object:', file)

    return null
  }

  const fileExtension = file.name.split('.').pop() || ''
  const fileName = `${Date.now()}.${fileExtension}`

  const { data, error } = await supabase.storage.from('user_avatars').upload(fileName, file)

  if (error) {
    console.error('Error uploading file:', error)

    return null
  }

  return supabase.storage.from('user_avatars').getPublicUrl(data.path).data.publicUrl
}

export const removeAvatarFromSupabase = async (avatarUrl: string) => {
  const supabase = await createClient()
  const fileName = avatarUrl.split('/').pop()

  if (!fileName) return
  const { error } = await supabase.storage.from('user_avatars').remove([fileName])

  if (error) {
    console.error('Error deleting old avatar:', error)

    return
  }
}

export const updateUserProfile = async (data: any) => {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser(data)

  return { error }
}
