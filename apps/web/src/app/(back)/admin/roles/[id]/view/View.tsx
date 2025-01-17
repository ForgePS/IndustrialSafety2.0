// Third-party Imports
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Badge } from '@repo/ui/components/ui/badge'
import type { Database } from '@repo/supabase/types'

type Permission = Database['public']['Tables']['permissions']['Row']

type Role = Database['public']['Tables']['roles']['Row']

type RoleData = Role & {
  permissions: Permission[]
}

type ViewProps = {
  roleData: RoleData
}

const View = ({ roleData }: ViewProps) => {
  return (
    <>
      <h2 className='text-2xl font-semibold sm:text-3xl'>View Role</h2>
      <form>
        <Card>
          <CardContent className='pbs-6'>
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
              <div>
                <h1 className='mbe-2 text-sm font-medium'>Name</h1>
                <p className='text-textPrimary font-medium capitalize'>{roleData.role}</p>
              </div>
              <div>
                <h1 className='mbe-2 text-sm font-medium'>Permissions</h1>
                <div className='flex flex-wrap items-center gap-2'>
                  {roleData.permissions.map(permission => (
                    <Badge key={permission.id} variant='tonalPrimary' className='capitalize'>
                      {permission.permission}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </>
  )
}

export default View
