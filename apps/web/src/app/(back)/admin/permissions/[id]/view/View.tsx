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
    <div className='flex flex-col gap-6'>
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>
        <Trans i18nKey='admin:permissionsViewTitle' />
      </h2>
      <form>
        <Card>
          <CardContent className='pbs-6'>
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
              <div>
                <h1 className='mbe-2 text-sm font-medium'>
                  <Trans i18nKey='admin:permissionsViewNameLabel' />
                </h1>
                <p className='text-textPrimary font-medium capitalize'>{permissionData.permission}</p>
              </div>
              <div>
                <h1 className='mbe-2 text-sm font-medium'>
                  <Trans i18nKey='admin:permissionsViewRolesLabel' />
                </h1>
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
