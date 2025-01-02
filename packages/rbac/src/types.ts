// Third-party Imports
import type { Database } from '@repo/supabase/types'

export type Permission = Database['public']['Tables']['permissions']['Row']['permission']
