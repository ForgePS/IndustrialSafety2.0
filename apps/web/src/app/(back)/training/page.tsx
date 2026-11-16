import type { Metadata } from 'next'

import TrainingOverview from './TrainingOverview'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getTrainingOverview } from '@/lib/forgeTraining'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { trainingTodayIso } from '@/lib/forgeTrainingLms'
import { assignmentFiltersFrom } from '@/lib/forgeTrainingManageRules'

export const metadata: Metadata = { title: 'Training' }

const TrainingPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('training.view')
  const organizationId = context.activeOrganization.id
  const params = await searchParams

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
      archivedCourses={data.archivedCourses}
      groups={data.groups}
      initialFilters={assignmentFiltersFrom(params)}
      initialCourseList={params.courses === 'archived' ? 'archived' : 'active'}
      todayIso={trainingTodayIso()}
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
      lmsLinks={[
        { href: '/training/matrix', label: 'Compliance Matrix', allowed: true },
        { href: '/training/groups', label: 'Groups', allowed: has('training.manage_groups') },
        { href: '/training/paper', label: 'Paper Quizzes', allowed: has('training.record_completion') },
        { href: '/training/portal', label: 'Kiosk Links', allowed: has('training.manage_portal') },
        { href: '/training/settings', label: 'Certificates', allowed: has('training.issue_certificate') },
        { href: '/training/reports', label: 'Reports', allowed: has('training.reports') },
        { href: '/training/library', label: 'Library', allowed: has('training.manage_content') },
        { href: '/training/notices', label: 'Notices & Retraining', allowed: has('training.manage_groups') }
      ].filter(link => link.allowed).map(({ href, label }) => ({ href, label }))}
    />
  )
}

export default TrainingPage
