'use client'

import { useMemo, useState, useTransition } from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TbBook2, TbCheck, TbClipboardList, TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { toast } from '@repo/ui/utils/toast'

import AssignmentManageButtons from '@/components/training/AssignmentManageButtons'
import {
  assignmentCounts,
  assignmentManageable,
  assignmentOverdue,
  filterAssignments,
  type AssignmentFilters,
  type AssignmentStatusFilter
} from '@/lib/forgeTrainingManageRules'

import { approveTrainingCompletion } from './actions'

type Course = {
  id: string
  course_code: string | null
  title: string
  category_key: string | null
  delivery_method: string | null
  duration_minutes: number | null
}

type Assignment = {
  id: string
  status: string
  due_date: string | null
  assigned_at: string
  course_id: string
  personnel_id: string
  notes: string | null
  forge_training_courses: { title: string; course_code: string | null } | null
  forge_personnel: { first_name: string; last_name: string; employee_number: string | null } | null
}

type Completion = {
  id: string
  completed_at: string
  result: string
  approval_status: string
  hours: number | null
  forge_training_courses: { title: string; course_code: string | null } | null
  forge_personnel: { first_name: string; last_name: string; employee_number: string | null } | null
}

type Group = { id: string; name: string; memberIds: string[] }

export type CourseListFilter = 'active' | 'archived'

const STATUS_OPTIONS: Array<{ key: AssignmentStatusFilter; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'canceled', label: 'Canceled' },
  { key: 'all', label: 'All statuses' }
]

const field = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'

const personName = (item: { forge_personnel: Assignment['forge_personnel'] }) =>
  item.forge_personnel ? String(item.forge_personnel.first_name) + ' ' + String(item.forge_personnel.last_name) : 'Unknown'

const TrainingOverview = ({
  courses,
  archivedCourses = [],
  assignments,
  completions,
  groups = [],
  categoryLabels,
  deliveryLabels,
  statusLabels,
  resultLabels,
  approvalLabels,
  canCreateCourse,
  canAssign,
  canRecordCompletion,
  canApprove,
  initialFilters,
  initialCourseList = 'active',
  todayIso,
  lmsLinks = []
}: {
  courses: Course[]
  archivedCourses?: Course[]
  assignments: Assignment[]
  completions: Completion[]
  groups?: Group[]
  categoryLabels: Record<string, string>
  deliveryLabels: Record<string, string>
  statusLabels: Record<string, string>
  resultLabels: Record<string, string>
  approvalLabels: Record<string, string>
  canCreateCourse: boolean
  canAssign: boolean
  canRecordCompletion: boolean
  canApprove: boolean

  /** Assignment list filters from the URL (`?status=&course=&group=&q=`). */
  initialFilters: AssignmentFilters

  /** Course catalog: active or archived (`?courses=archived`). */
  initialCourseList?: CourseListFilter
  todayIso: string

  /** Links to the LMS tools the viewer may use (matrix, groups, paper quizzes, kiosk, certificates). */
  lmsLinks?: Array<{ href: string; label: string }>
}) => {
  const pathname = usePathname()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<AssignmentFilters>(initialFilters)
  const [courseList, setCourseList] = useState<CourseListFilter>(initialCourseList)
  const [pending, startTransition] = useTransition()

  const q = search.trim().toLowerCase()

  // Keeps the filters in the URL so a filtered list can be shared or reloaded. The native history API updates the
  // address without a server round trip (all rows are already loaded).
  const syncUrl = (next: AssignmentFilters, nextCourseList: CourseListFilter) => {
    const params = new URLSearchParams()

    if (next.status !== 'open') params.set('status', next.status)
    if (next.courseId) params.set('course', next.courseId)
    if (next.groupId) params.set('group', next.groupId)
    if (next.q) params.set('q', next.q)
    if (nextCourseList === 'archived') params.set('courses', 'archived')

    const query = params.toString()

    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname)
  }

  const updateFilters = (patch: Partial<AssignmentFilters>) => {
    const next = { ...filters, ...patch }

    setFilters(next)
    syncUrl(next, courseList)
  }

  const showCourses = (next: CourseListFilter) => {
    setCourseList(next)
    syncUrl(filters, next)
  }

  /** Dashboard tiles drill into the assignment list by status. */
  const drill = (status: AssignmentStatusFilter) => {
    updateFilters({ status })
    document.getElementById('training-assignments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const catalog = courseList === 'archived' ? archivedCourses : courses

  const filteredCourses = useMemo(
    () =>
      catalog.filter(
        course =>
          !q ||
          course.title.toLowerCase().includes(q) ||
          course.course_code?.toLowerCase().includes(q) ||
          course.category_key?.toLowerCase().includes(q) ||
          (course.category_key ? categoryLabels[course.category_key]?.toLowerCase().includes(q) : false)
      ),
    [catalog, categoryLabels, q]
  )

  const counts = useMemo(() => assignmentCounts(assignments, todayIso), [assignments, todayIso])

  const groupMembers = useMemo(() => new Set(groups.find(group => group.id === filters.groupId)?.memberIds || []), [filters.groupId, groups])

  const filteredAssignments = useMemo(
    () =>
      filterAssignments(
        assignments.map(item => ({
          ...item,
          personName: personName(item),
          employeeNumber: item.forge_personnel?.employee_number || null,
          courseTitle: item.forge_training_courses?.title || ''
        })),
        filters,
        todayIso,
        groupMembers
      ),
    [assignments, filters, groupMembers, todayIso]
  )

  const allCourses = useMemo(() => [...courses, ...archivedCourses].sort((a, b) => a.title.localeCompare(b.title)), [archivedCourses, courses])
  const archivedIds = useMemo(() => new Set(archivedCourses.map(course => course.id)), [archivedCourses])

  const filteredCompletions = useMemo(
    () =>
      completions.filter(item => {
        const personnel = item.forge_personnel ? String(item.forge_personnel.first_name) + ' ' + String(item.forge_personnel.last_name) : ''
        const course = item.forge_training_courses?.title || ''
        const result = resultLabels[item.result] || item.result

        return !q || personnel.toLowerCase().includes(q) || course.toLowerCase().includes(q) || result.toLowerCase().includes(q)
      }),
    [completions, q, resultLabels]
  )

  const approve = (completionId: string) => {
    startTransition(async () => {
      const result = await approveTrainingCompletion(completionId)

      if ('error' in result) {
        toast('error', result.error || 'Unable to approve completion.')

        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const filtersActive = filters.status !== 'open' || filters.courseId || filters.groupId || filters.q

  const tile = (label: string, value: number, onClick: () => void, testId: string, selected: boolean) => (
    <button type='button' onClick={onClick} data-testid={testId} aria-pressed={selected} className='text-left'>
      <Card className={'hover:border-primary h-full transition-colors' + (selected ? ' border-primary' : '')}>
        <CardHeader className='pb-2'>
          <CardDescription>{label}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='text-3xl font-semibold'>{value}</div>
        </CardContent>
      </Card>
    </button>
  )

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Training</h1>
          <p className='text-textSecondary mt-2'>Courses, assignments and completions within your assigned Training scope.</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canCreateCourse ? (
            <Button variant='outline' asChild>
              <Link href='/training/courses/create'>
                <TbPlus />
                New Course
              </Link>
            </Button>
          ) : null}
          {canAssign ? (
            <Button variant='outline' asChild>
              <Link href='/training/assign'>
                <TbClipboardList />
                Assign Training
              </Link>
            </Button>
          ) : null}
          {canRecordCompletion ? (
            <Button asChild>
              <Link href='/training/completions/create'>
                <TbCheck />
                Record Completion
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {lmsLinks.length ? (
        <nav className='flex flex-wrap gap-2' aria-label='Training tools' data-testid='training-tools'>
          {lmsLinks.map(link => (
            <Button key={link.href} size='sm' variant='tonalDefault' asChild>
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>
      ) : null}

      <Card>
        <CardContent className='p-5'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search courses and completions...' className='pl-10' />
          </div>
        </CardContent>
      </Card>

      <div className='grid grid-cols-2 gap-4 md:grid-cols-5' data-testid='training-tiles'>
        {tile('Active Courses', courses.length, () => showCourses('active'), 'tile-courses', courseList === 'active')}
        {tile('Open Assignments', counts.open, () => drill('open'), 'tile-open', filters.status === 'open')}
        {tile('Overdue', counts.overdue, () => drill('overdue'), 'tile-overdue', filters.status === 'overdue')}
        {tile('Completed Assignments', counts.completed, () => drill('completed'), 'tile-completed', filters.status === 'completed')}
        {tile('Canceled', counts.canceled, () => drill('canceled'), 'tile-canceled', filters.status === 'canceled')}
      </div>

      <Card>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3'>
          <CardTitle className='flex items-center gap-2'>
            <TbBook2 />
            Course Catalog
          </CardTitle>
          <div className='flex gap-2' role='group' aria-label='Course list'>
            <Button size='sm' variant={courseList === 'active' ? 'default' : 'outline'} onClick={() => showCourses('active')} aria-pressed={courseList === 'active'}>
              Active ({courses.length})
            </Button>
            <Button size='sm' variant={courseList === 'archived' ? 'default' : 'outline'} onClick={() => showCourses('archived')} aria-pressed={courseList === 'archived'}>
              Archived ({archivedCourses.length})
            </Button>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className='text-right'>Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCourses.length ? (
              filteredCourses.map(course => (
                <TableRow key={course.id} data-course-row={course.title}>
                  <TableCell>
                    <div className='font-semibold'>{course.title}</div>
                    <div className='text-textSecondary text-xs'>{course.course_code || 'No code'}</div>
                  </TableCell>
                  <TableCell>{course.category_key ? categoryLabels[course.category_key] || course.category_key : '—'}</TableCell>
                  <TableCell>{course.delivery_method ? deliveryLabels[course.delivery_method] || course.delivery_method : '—'}</TableCell>
                  <TableCell>{course.duration_minutes ? String(course.duration_minutes) + ' min' : '—'}</TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' asChild>
                      <Link href={'/training/courses/' + course.id}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className='py-8 text-center'>
                  {courseList === 'archived' ? 'No archived courses match.' : 'No courses match the search.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card id='training-assignments' className='scroll-mt-4'>
        <CardHeader className='flex flex-col gap-3'>
          <CardTitle>Assignments</CardTitle>
          <div className='flex flex-wrap items-end gap-3' data-testid='assignment-filters'>
            <Input
              aria-label='Search assignments'
              value={filters.q}
              onChange={event => updateFilters({ q: event.target.value.slice(0, 100) })}
              placeholder='Employee, employee # or course'
              className='w-64'
            />
            <select aria-label='Status' className={field} value={filters.status} onChange={event => updateFilters({ status: event.target.value as AssignmentStatusFilter })}>
              {STATUS_OPTIONS.map(option => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <select aria-label='Course' className={field} value={filters.courseId} onChange={event => updateFilters({ courseId: event.target.value })}>
              <option value=''>Any course</option>
              {allCourses.map(course => (
                <option key={course.id} value={course.id}>
                  {course.title}
                  {archivedIds.has(course.id) ? ' (archived)' : ''}
                </option>
              ))}
            </select>
            <select aria-label='Group' className={field} value={filters.groupId} onChange={event => updateFilters({ groupId: event.target.value })}>
              <option value=''>Any group</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            {filtersActive ? (
              <button type='button' className='text-primary self-center text-sm hover:underline' onClick={() => updateFilters({ status: 'open', courseId: '', groupId: '', q: '' })}>
                Clear
              </button>
            ) : null}
          </div>
          <p className='text-textSecondary text-sm' data-assignments-count>
            {filteredAssignments.length} assignment{filteredAssignments.length === 1 ? '' : 's'}
          </p>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Personnel</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              {canAssign ? <TableHead className='text-right'>Action</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAssignments.length ? (
              filteredAssignments.map(item => {
                const late = assignmentOverdue(item, todayIso)

                return (
                  <TableRow key={item.id} data-assignment-row={item.personName + ' · ' + item.courseTitle}>
                    <TableCell>
                      {item.personName}
                      {item.employeeNumber ? <div className='text-textSecondary text-xs'>#{item.employeeNumber}</div> : null}
                    </TableCell>
                    <TableCell>
                      {item.courseTitle || 'Unknown course'}
                      {archivedIds.has(item.course_id) ? <span className='text-textSecondary text-xs'> (archived course)</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge size='sm' variant={item.status === 'completed' ? 'tonalSuccess' : late ? 'destructive' : 'secondary'}>
                        {late ? 'Overdue' : statusLabels[item.status] || (item.status === 'canceled' ? 'Canceled' : item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.due_date || '—'}</TableCell>
                    {canAssign ? (
                      <TableCell className='text-right'>
                        {assignmentManageable(item.status) ? (
                          <AssignmentManageButtons assignment={{ id: item.id, due_date: item.due_date, notes: item.notes, label: item.personName + ' · ' + (item.courseTitle || 'Training') }} />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={canAssign ? 5 : 4} className='py-8 text-center'>
                  No assignments match the filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completions</CardTitle>
          <CardDescription>{completions.length} in scope</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Personnel</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead className='text-right'>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCompletions.length ? (
              filteredCompletions.map(item => (
                <TableRow key={item.id}>
                  <TableCell>{personName(item)}</TableCell>
                  <TableCell>{item.forge_training_courses?.title || 'Unknown course'}</TableCell>
                  <TableCell>{new Date(item.completed_at).toLocaleString()}</TableCell>
                  <TableCell>{resultLabels[item.result] || item.result}</TableCell>
                  <TableCell>
                    <Badge size='sm' variant={item.approval_status === 'approved' ? 'tonalSuccess' : 'secondary'}>
                      {approvalLabels[item.approval_status] || item.approval_status}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    {canApprove && item.approval_status === 'pending' ? (
                      <Button size='sm' onClick={() => approve(item.id)} disabled={pending}>
                        Approve
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className='py-8 text-center'>
                  No completions match the search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default TrainingOverview
