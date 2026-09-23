'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { TbBook2, TbCheck, TbClipboardList, TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { toast } from '@repo/ui/utils/toast'
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

const TrainingOverview = ({
  courses,
  assignments,
  completions,
  categoryLabels,
  deliveryLabels,
  statusLabels,
  resultLabels,
  approvalLabels,
  canCreateCourse,
  canAssign,
  canRecordCompletion,
  canApprove
}: {
  courses: Course[]
  assignments: Assignment[]
  completions: Completion[]
  categoryLabels: Record<string, string>
  deliveryLabels: Record<string, string>
  statusLabels: Record<string, string>
  resultLabels: Record<string, string>
  approvalLabels: Record<string, string>
  canCreateCourse: boolean
  canAssign: boolean
  canRecordCompletion: boolean
  canApprove: boolean
}) => {
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()

  const q = search.trim().toLowerCase()

  const filteredCourses = useMemo(
    () => courses.filter(course =>
      !q ||
      course.title.toLowerCase().includes(q) ||
      course.course_code?.toLowerCase().includes(q) ||
      course.category_key?.toLowerCase().includes(q) ||
      (course.category_key ? categoryLabels[course.category_key]?.toLowerCase().includes(q) : false)
    ),
    [categoryLabels, courses, q]
  )

  const filteredAssignments = useMemo(
    () => assignments.filter(item => {
      const personnel = item.forge_personnel ? String(item.forge_personnel.first_name) + ' ' + String(item.forge_personnel.last_name) : ''
      const course = item.forge_training_courses?.title || ''
      const status = statusLabels[item.status] || item.status
      return !q || personnel.toLowerCase().includes(q) || course.toLowerCase().includes(q) || status.toLowerCase().includes(q)
    }),
    [assignments, q, statusLabels]
  )

  const filteredCompletions = useMemo(
    () => completions.filter(item => {
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

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Training</h1>
          <p className='text-textSecondary mt-2'>Courses, assignments and completions within your assigned Training scope.</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canCreateCourse ? <Button variant='outline' asChild><Link href='/training/courses/create'><TbPlus />New Course</Link></Button> : null}
          {canAssign ? <Button variant='outline' asChild><Link href='/training/assign'><TbClipboardList />Assign Training</Link></Button> : null}
          {canRecordCompletion ? <Button asChild><Link href='/training/completions/create'><TbCheck />Record Completion</Link></Button> : null}
        </div>
      </div>

      <Card>
        <CardContent className='p-5'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search training...' className='pl-10' />
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card><CardHeader className='pb-2'><CardDescription>Active Courses</CardDescription></CardHeader><CardContent><div className='text-3xl font-semibold'>{courses.length}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Assignments in Scope</CardDescription></CardHeader><CardContent><div className='text-3xl font-semibold'>{assignments.length}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Completions in Scope</CardDescription></CardHeader><CardContent><div className='text-3xl font-semibold'>{completions.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'><TbBook2 />Course Catalog</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Category</TableHead><TableHead>Delivery</TableHead><TableHead>Duration</TableHead><TableHead className='text-right'>Open</TableHead></TableRow></TableHeader>
          <TableBody>
            {filteredCourses.length ? filteredCourses.map(course => (
              <TableRow key={course.id}>
                <TableCell><div className='font-semibold'>{course.title}</div><div className='text-textSecondary text-xs'>{course.course_code || 'No code'}</div></TableCell>
                <TableCell>{course.category_key ? categoryLabels[course.category_key] || course.category_key : '—'}</TableCell>
                <TableCell>{course.delivery_method ? deliveryLabels[course.delivery_method] || course.delivery_method : '—'}</TableCell>
                <TableCell>{course.duration_minutes ? String(course.duration_minutes) + ' min' : '—'}</TableCell>
                <TableCell className='text-right'><Button size='sm' variant='outline' asChild><Link href={'/training/courses/' + course.id}>Open</Link></Button></TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={5} className='py-8 text-center'>No courses match the search.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader><CardTitle>Assignments</CardTitle></CardHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Personnel</TableHead><TableHead>Course</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
          <TableBody>
            {filteredAssignments.length ? filteredAssignments.map(item => (
              <TableRow key={item.id}>
                <TableCell>{item.forge_personnel ? String(item.forge_personnel.first_name) + ' ' + String(item.forge_personnel.last_name) : 'Unknown'}</TableCell>
                <TableCell>{item.forge_training_courses?.title || 'Unknown course'}</TableCell>
                <TableCell><Badge size='sm' variant={item.status === 'completed' ? 'tonalSuccess' : 'secondary'}>{statusLabels[item.status] || item.status}</Badge></TableCell>
                <TableCell>{item.due_date || '—'}</TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={4} className='py-8 text-center'>No assignments match the search.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader><CardTitle>Completions</CardTitle></CardHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Personnel</TableHead><TableHead>Course</TableHead><TableHead>Completed</TableHead><TableHead>Result</TableHead><TableHead>Approval</TableHead><TableHead className='text-right'>Action</TableHead></TableRow></TableHeader>
          <TableBody>
            {filteredCompletions.length ? filteredCompletions.map(item => (
              <TableRow key={item.id}>
                <TableCell>{item.forge_personnel ? String(item.forge_personnel.first_name) + ' ' + String(item.forge_personnel.last_name) : 'Unknown'}</TableCell>
                <TableCell>{item.forge_training_courses?.title || 'Unknown course'}</TableCell>
                <TableCell>{new Date(item.completed_at).toLocaleString()}</TableCell>
                <TableCell>{resultLabels[item.result] || item.result}</TableCell>
                <TableCell><Badge size='sm' variant={item.approval_status === 'approved' ? 'tonalSuccess' : 'secondary'}>{approvalLabels[item.approval_status] || item.approval_status}</Badge></TableCell>
                <TableCell className='text-right'>
                  {canApprove && item.approval_status === 'pending' ? (
                    <Button size='sm' onClick={() => approve(item.id)} disabled={pending}>Approve</Button>
                  ) : '—'}
                </TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={6} className='py-8 text-center'>No completions match the search.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default TrainingOverview
