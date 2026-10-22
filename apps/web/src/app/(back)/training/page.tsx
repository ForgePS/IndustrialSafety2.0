import type { Metadata } from 'next'
import TrainingOverview from './TrainingOverview'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getTrainingOverview } from '@/lib/forgeTraining'
import { getEffectiveLookup } from '@/lib/forgeLookups'

export const metadata: Metadata = { title: 'Training' }

const TrainingPage = async () => {
  const context = await requireTenantPermission('training.view')
  const organizationId = context.activeOrganization.id

  const [data, categoryLookup, deliveryLookup, statusLookup, resultLookup, approvalLookup] = await Promise.all([
    getTrainingOverview({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'training.category' }),
    getEffectiveLookup({ organizationId, lookupKey: 'training.delivery_method' }),
    getEffectiveLookup({ organizationId, lookupKey: 'training.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'training.result' }),
    getEffectiveLookup({ organizationId, lookupKey: 'training.approval_status' })
  ])

  const has = (key: string) =>
    context.access.effective.some(item => item.permissionKey === key && item.allowed)

  return (
    <TrainingOverview
      courses={data.courses}
      assignments={data.assignments}
      completions={data.completions}
      categoryLabels={Object.fromEntries(categoryLookup.options.map(option => [option.key, option.label]))}
      deliveryLabels={Object.fromEntries(deliveryLookup.options.map(option => [option.key, option.label]))}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      resultLabels={Object.fromEntries(resultLookup.options.map(option => [option.key, option.label]))}
      approvalLabels={Object.fromEntries(approvalLookup.options.map(option => [option.key, option.label]))}
      canCreateCourse={has('training.create_course')}
      canAssign={has('training.assign')}
      canRecordCompletion={has('training.record_completion')}
      canApprove={has('training.approve')}
    />
  )
}

export default TrainingPage
