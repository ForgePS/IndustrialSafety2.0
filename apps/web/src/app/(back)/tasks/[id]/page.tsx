import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import TaskControls from '../TaskControls'
import TaskRecordForm from '../TaskRecordForm'
import type { TaskFormValues } from '../actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { getTaskDetail, taskWithinScope } from '@/lib/forgeTasks'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import ForgeAiContextButton from '@/components/forge-ai/ForgeAiContextButton'

export const metadata: Metadata = { title: 'Task' }

const TaskDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('tasks.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: task }, form, statusLookup, priorityLookup] = await Promise.all([
    supabase
      .from('forge_tasks')
      .select('*, forge_personnel!forge_tasks_assigned_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id), locations(name, code), divisions(name, code)')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle(),
    getEffectiveForm({ organizationId, formKey: 'tasks.task' }),
    getEffectiveLookup({ organizationId, lookupKey: 'tasks.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'tasks.priority' })
  ])

  if (!task || !form) notFound()

  const mayView = await taskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    task
  })
  if (!mayView) notFound()

  const permissions = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissions.get('tasks.edit')
  const assignPermission = permissions.get('tasks.assign')
  const completePermission = permissions.get('tasks.complete')
  const archivePermission = permissions.get('tasks.archive')
  const canUseAi = Boolean(permissions.get('forge_ai.use'))

  const within = async (permission: any) =>
    permission
      ? taskWithinScope({
          organizationId,
          userId: context.user.id,
          scope: permission.scope,
          task
        })
      : false

  const [canEdit, canAssign, canComplete, canArchive, detail, personnel, { data: allLocations }, { data: allDivisions }, assignments] = await Promise.all([
    within(editPermission),
    within(assignPermission),
    within(completePermission),
    within(archivePermission),
    getTaskDetail({ organizationId, taskId: task.id }),
    assignPermission || editPermission
      ? getScopedPersonnel({
          organizationId,
          userId: context.user.id,
          permission: (assignPermission || editPermission) as any
        })
      : Promise.resolve([]),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    getTenantScopeAssignments({ organizationId, userId: context.user.id })
  ])

  const assignmentScope = (assignPermission || editPermission)?.scope || 'own'

  const locations =
    assignmentScope === 'organization'
      ? (allLocations || [])
      : (allLocations || []).filter((item: any) => assignments.locationIds.includes(item.id))

  const divisions =
    assignmentScope === 'organization'
      ? (allDivisions || [])
      : (allDivisions || []).filter((item: any) => assignments.divisionIds.includes(item.id))

  const statusLabels = Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))
  const priorityLabels = Object.fromEntries(priorityLookup.options.map(option => [option.key, option.label]))
  const overdue = Boolean(
    task.due_at &&
    new Date(task.due_at).getTime() < Date.now() &&
    !['completed','canceled'].includes(task.status)
  )

  const values: TaskFormValues = {
    title: task.title,
    description: task.description || '',
    priority: task.priority,
    status: task.status,
    assigned_personnel_id: task.assigned_personnel_id || '',
    location_id: task.location_id || '',
    division_id: task.division_id || '',
    start_at: task.start_at ? new Date(task.start_at).toISOString().slice(0, 16) : '',
    due_at: task.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : '',
    verification_notes: task.verification_notes || ''
  }

  const capaManaged = task.source_type === 'corrective_action'

  const readOnly =
    Boolean(task.archived_at) ||
    task.status === 'completed' ||
    capaManaged ||
    !canEdit

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Tasks</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{task.title}</h1>
            <Badge size='sm' variant={task.priority === 'critical' ? 'destructive' : task.priority === 'high' ? 'secondary' : 'outline'}>
              {priorityLabels[task.priority] || task.priority}
            </Badge>
            <Badge size='sm' variant={task.status === 'completed' ? 'tonalSuccess' : 'outline'}>
              {statusLabels[task.status] || task.status}
            </Badge>
            {overdue ? <Badge size='sm' variant='destructive'>Overdue</Badge> : null}
            {task.corrective_action ? <Badge size='sm' variant='outline'>Corrective Action</Badge> : null}
          </div>
          <p className='text-textSecondary mt-2'>
            {task.task_number}
            {task.source_reference ? ' · Source ' + task.source_reference : ''}
          </p>
        </div>
        {canUseAi ? (
          <ForgeAiContextButton
            contextType='task'
            recordId={task.id}
            recordLabel={task.task_number}
          />
        ) : null}
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card><CardHeader className='pb-2'><CardDescription>Assigned To</CardDescription></CardHeader><CardContent><div className='font-semibold'>{task.forge_personnel ? task.forge_personnel.first_name + ' ' + task.forge_personnel.last_name : '—'}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Location</CardDescription></CardHeader><CardContent><div className='font-semibold'>{task.locations?.name || '—'}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Due</CardDescription></CardHeader><CardContent><div className={overdue ? 'text-destructive font-semibold' : 'font-semibold'}>{task.due_at ? new Date(task.due_at).toLocaleString() : 'No due date'}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Completed</CardDescription></CardHeader><CardContent><div className='font-semibold'>{task.completed_at ? new Date(task.completed_at).toLocaleString() : 'Open'}</div></CardContent></Card>
      </div>

      {task.archived_at ? (
        <Card>
          <CardHeader>
            <CardTitle>Archived Task</CardTitle>
            <CardDescription>{new Date(task.archived_at).toLocaleString()}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {capaManaged && task.source_id ? (
        <Card>
          <CardHeader>
            <CardTitle>Managed by Corrective Action</CardTitle>
            <CardDescription>
              Assignment, completion, verification, and closure are controlled by the linked CAPA workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant='outline' asChild>
              <Link href={'/corrective-actions/' + task.source_id}>Open {task.source_reference || 'Corrective Action'}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <TaskControls
        taskId={task.id}
        status={task.status}
        canComplete={Boolean(canComplete) && !capaManaged}
        canArchive={Boolean(canArchive) && !capaManaged}
        archived={Boolean(task.archived_at)}
      />

      <TaskRecordForm
        form={form}
        taskId={task.id}
        initialValues={values}
        readOnly={readOnly}
        canAssign={Boolean(canAssign)}
        personnel={(personnel || []).map((person: any) => ({
          id: person.id,
          label: person.employee_number
            ? person.first_name + ' ' + person.last_name + ' (' + person.employee_number + ')'
            : person.first_name + ' ' + person.last_name
        }))}
        locations={locations.map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
        divisions={divisions.map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
          <CardDescription>Task discussion and operational updates.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {detail.comments.length ? detail.comments.map((comment: any) => (
            <div key={comment.id} className='rounded-lg border p-3'>
              <div className='whitespace-pre-wrap text-sm'>{comment.comment}</div>
              <div className='text-textSecondary mt-2 text-xs'>{new Date(comment.created_at).toLocaleString()}</div>
            </div>
          )) : <div className='text-textSecondary text-sm'>No comments yet.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Task lifecycle and assignment history.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {detail.activity.length ? detail.activity.map((item: any) => (
            <div key={item.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium capitalize'>{String(item.activity_type).replaceAll('_', ' ')}</div>
                <div className='text-textSecondary text-xs'>{new Date(item.created_at).toLocaleString()}</div>
              </div>
              {item.message ? <div className='text-textSecondary mt-1 text-sm'>{item.message}</div> : null}
            </div>
          )) : <div className='text-textSecondary text-sm'>No activity recorded yet.</div>}
        </CardContent>
      </Card>
    </div>
  )
}

export default TaskDetailPage
