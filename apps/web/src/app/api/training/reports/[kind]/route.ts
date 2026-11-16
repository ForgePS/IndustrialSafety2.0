import { NextResponse } from 'next/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { activityPeriodFrom, qcParamsFrom, recordFiltersFrom } from '@/lib/forgeTrainingReportParams'
import { TRAINING_SOURCE_LABELS, getActiveCourses, getOverdueTraining, getTrainingActivity, getTrainingQc, searchTrainingRecords } from '@/lib/forgeTrainingReports'
import { toCsv } from '@/lib/forgeTrainingReportRules'
import { trainingTodayIso } from '@/lib/forgeTrainingLms'

export const dynamic = 'force-dynamic'

const KINDS = ['records', 'overdue', 'activity', 'qc'] as const

/** CSV for a training report. Needs training.reports; rows follow its scope and the page's filters. */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  const context = await tenantPermissionOrNull('training.reports')

  if (!context || !(KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const query = Object.fromEntries(new URL(request.url).searchParams)
  const scope = { organizationId: context.activeOrganization.id, userId: context.user.id, permission: context.permission }
  let csv = ''
  let rowCount = 0

  if (kind === 'records') {
    const { rows } = await searchTrainingRecords(scope, recordFiltersFrom(query))

    rowCount = rows.length
    csv = toCsv(
      ['Employee', 'Employee #', 'Department', 'Location', 'Course', 'Result', 'Approval', 'Score', 'How', 'Completed', 'Expires', 'Certificate #'],
      rows.map((row: any) => [
        row.personName,
        row.employeeNumber,
        row.department,
        row.location,
        row.courseTitle,
        row.result,
        row.approval_status,
        row.score ?? '',
        TRAINING_SOURCE_LABELS[row.source] || row.source,
        String(row.completed_at).slice(0, 10),
        row.expires_at || '',
        row.certificate_number || ''
      ])
    )
  } else if (kind === 'overdue') {
    const q = String(query.q || '').trim().toLowerCase()
    const department = String(query.department || '')

    const rows = (await getOverdueTraining(scope))
      .filter(row => !department || (row.department || 'No department') === department)
      .filter(row => !q || row.personName.toLowerCase().includes(q) || row.employeeNumber.toLowerCase().includes(q) || row.courseTitle.toLowerCase().includes(q))

    rowCount = rows.length
    csv = toCsv(
      ['Department', 'Employee', 'Employee #', 'Location', 'Course', 'Status', 'Due', 'Days late'],
      rows.map(row => [row.department || 'No department', row.personName, row.employeeNumber, row.location, row.courseTitle, row.status, row.due_date, row.daysLate])
    )
  } else if (kind === 'activity') {
    const period = activityPeriodFrom(query)
    const rows = await getTrainingActivity(scope, period)

    rowCount = rows.length
    csv = toCsv(
      ['Course', 'Assigned', 'In progress', 'Completed', 'Latest activity', 'From', 'To'],
      rows.map(row => [row.courseTitle, row.assigned, row.inProgress, row.completed, row.latest ? String(row.latest).slice(0, 10) : '', period.from, period.to])
    )
  } else {
    const filters = qcParamsFrom(query)
    const [report, courses] = await Promise.all([getTrainingQc(scope, filters), getActiveCourses(scope.organizationId)])
    const titles = new Map(courses.map(course => [course.id, course.title]))
    const s = report.summary

    rowCount = report.questionStats.length
    csv = toCsv(
      ['Section', 'Item', 'Value', 'Detail'],
      [
        ['Summary', 'Quizzes submitted', s.attempts, ''],
        ['Summary', 'Learners', s.learners, ''],
        ['Summary', 'Pass rate %', s.passRate ?? '', ''],
        ['Summary', 'First-try pass rate %', s.firstAttemptPassRate ?? '', ''],
        ['Summary', 'Average score %', s.averageScore ?? '', ''],
        ['Summary', 'Average attempts to pass', s.averageAttemptsToPass ?? '', ''],
        ...Object.entries(report.buckets).map(([bucket, count]) => ['Score spread', bucket + '%', count, '']),
        ...report.months.map(row => ['Month', row.month, row.attempts, `${row.passRate ?? ''}% passed`]),
        ...report.questionStats.map(row => ['Question', row.stem, `${row.correctRate}%`, `${row.correct} of ${row.presented} correct · ${titles.get(row.course_id) || ''}`])
      ]
    )
  }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId: context.activeOrganization.id,
    action: 'training.report_exported',
    entityType: 'training_report',
    entityId: context.activeOrganization.id,
    afterValue: { kind, rows: rowCount }
  })

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="training-${kind}-${trainingTodayIso()}.csv"`,
      'Cache-Control': 'no-store'
    }
  })
}
