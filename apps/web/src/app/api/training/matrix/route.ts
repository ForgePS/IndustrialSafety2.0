import { writeForgeAudit } from '@/lib/forgeAudit'
import { csvResponse } from '@/lib/forgeCsv'
import { getComplianceMatrix, trainingTodayIso } from '@/lib/forgeTrainingLms'
import { MATRIX_STATUS_LABELS } from '@/lib/forgeTrainingRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

/** Compliance matrix as CSV: one row per person and course, with status, expiry and due date. */
export const GET = async (request: Request) => {
  const context = await requireTenantPermission('training.export')
  const organizationId = context.activeOrganization.id
  const params = new URL(request.url).searchParams

  // Personnel scope follows the viewer's training access, as on the page.
  const view = context.access.effective.find(item => item.permissionKey === 'training.view' && item.allowed) || context.permission

  const matrix = await getComplianceMatrix({
    organizationId,
    userId: context.user.id,
    personnelPermission: view,
    groupId: params.get('group'),
    allCourses: params.get('courses') === 'all'
  })

  const rows = matrix.rows.flatMap(row =>
    matrix.columns.map((course: any) => {
      const cell = row.cells[course.id]

      return [row.name, row.employeeNumber || '', course.title, MATRIX_STATUS_LABELS[cell.status], cell.completedAt || '', cell.expiresAt || '', cell.dueDate || '']
    })
  )

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'training.matrix_exported',
    entityType: 'training_matrix',
    entityId: organizationId,
    afterValue: { rows: rows.length, group_id: params.get('group') }
  })

  return csvResponse(`training-matrix-${trainingTodayIso()}.csv`, ['Person', 'Employee number', 'Course', 'Status', 'Completed', 'Expires', 'Due'], rows)
}
