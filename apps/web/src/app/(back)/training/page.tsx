import type { Metadata } from 'next'
import TrainingOverview from './TrainingOverview'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getTrainingOverview } from '@/lib/forgeTraining'

export const metadata: Metadata = { title: 'Training' }

const TrainingPage = async () => {
  const context = await requireTenantPermission('training.view')
  const data = await getTrainingOverview({
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    permission: context.permission
  })

  const has = (key: string) =>
    context.access.effective.some(item => item.permissionKey === key && item.allowed)

  return (
    <TrainingOverview
      courses={data.courses}
      assignments={data.assignments}
      completions={data.completions}
      canCreateCourse={has('training.create_course')}
      canAssign={has('training.assign')}
      canRecordCompletion={has('training.record_completion')}
      canApprove={has('training.approve')}
    />
  )
}

export default TrainingPage
