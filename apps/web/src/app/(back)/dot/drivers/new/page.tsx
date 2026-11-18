import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import { getDqfCandidates } from '@/lib/forgeDot'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import NewDriverFileForm from './NewDriverFileForm'

export const metadata: Metadata = { title: 'New Driver File' }

const NewDriverFilePage = async () => {
  const context = await requireTenantPermission('dot.edit')
  const candidates = await getDqfCandidates({ organizationId: context.activeOrganization.id, userId: context.user.id, permission: context.permission })

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader active='drivers' allowed={allowedFrom(context)} />
      <Card className='max-w-2xl'>
        <CardHeader>
          <CardTitle>New driver qualification file</CardTitle>
          <CardDescription>
            Pick the driver from personnel. Opening a file marks them as a DOT driver. Add people in Personnel first if they are not listed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewDriverFileForm candidates={candidates} />
        </CardContent>
      </Card>
    </div>
  )
}

export default NewDriverFilePage
