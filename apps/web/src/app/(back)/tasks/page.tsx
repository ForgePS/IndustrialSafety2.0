import type { Metadata } from 'next'
import TaskList from './TaskList'
import type { TaskListItem } from './TaskList'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getScopedTasks } from '@/lib/forgeTasks'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Tasks' }

const TasksPage = async () => {
  const context = await requireTenantPermission('tasks.view')
  const organizationId = context.activeOrganization.id

  const [records, statusLookup, priorityLookup] = await Promise.all([
    getScopedTasks({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'tasks.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'tasks.priority' })
  ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'tasks.create' && item.allowed
  )

  const tasks: TaskListItem[] = records.map((record: any) => ({
    id: record.id,
    task_number: record.task_number,
    title: record.title,
    status: record.status,
    priority: record.priority,
    due_at: record.due_at,
    assigneeName: record.forge_personnel
      ? [record.forge_personnel.first_name, record.forge_personnel.last_name].filter(Boolean).join(' ')
      : null,
    locationName: record.locations?.name || null,
    source_reference: record.source_reference,
    corrective_action: Boolean(record.corrective_action)
  }))

  return (
    <TaskList
      tasks={tasks}
      canCreate={canCreate}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      priorityLabels={Object.fromEntries(priorityLookup.options.map(option => [option.key, option.label]))}
    />
  )
}

export default TasksPage
