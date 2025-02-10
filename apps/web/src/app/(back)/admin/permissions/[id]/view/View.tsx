// Third-party Imports
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Badge } from '@repo/ui/components/ui/badge'
import Trans from '@repo/i18n/Trans'
import type { Database } from '@repo/supabase/types'

type Permission = Database['public']['Tables']['permissions']['Row']
type Role = Database['public']['Tables']['roles']['Row']

type PermissionWithRoles = Permission & {
  roles: Role[]
}

type ViewProps = {
  permissionData: PermissionWithRoles
}

const View = ({ permissionData }: ViewProps) => {
  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:permissionsViewTitle' />
      </h1>
      <form>
        <Card>
          <CardContent className='pbs-6'>
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
              <div>
                <h2 className='mbe-2 text-sm font-medium'>
                  <Trans i18nKey='admin:permissionsViewNameLabel' />
                </h2>
                <p className='text-textPrimary font-medium capitalize'>{permissionData.permission}</p>
              </div>
              <div>
                <h2 className='mbe-2 text-sm font-medium'>
                  <Trans i18nKey='admin:permissionsViewRolesLabel' />
                </h2>
                <div className='flex flex-wrap items-center gap-2'>
                  {permissionData.roles && permissionData.roles.length > 0 ? (
                    permissionData.roles.map(role => (
                      <Badge key={role.id} variant='tonalPrimary' className='capitalize'>
                        {role.role}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant='tonalPrimary'>
                      <Trans i18nKey='admin:permissionsViewNoRoles' />
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}

export default View
