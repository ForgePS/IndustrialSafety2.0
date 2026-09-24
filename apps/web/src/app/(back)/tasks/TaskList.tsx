'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbChecklist, TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type TaskListItem = {
  id: string
  task_number: string
  title: string
  status: string
  priority: string
  due_at: string | null
  assigneeName: string | null
  locationName: string | null
  source_reference: string | null
  corrective_action: boolean
}

const TaskList = ({
  tasks,
  canCreate,
  statusLabels,
  priorityLabels
}: {
  tasks: TaskListItem[]
  canCreate: boolean
  statusLabels: Record<string, string>
  priorityLabels: Record<string, string>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return tasks.filter(task => {
      const matchesSearch =
        !q ||
        task.task_number.toLowerCase().includes(q) ||
        task.title.toLowerCase().includes(q) ||
        task.assigneeName?.toLowerCase().includes(q) ||
        task.locationName?.toLowerCase().includes(q) ||
        task.source_reference?.toLowerCase().includes(q)

      const matchesStatus =
        status === 'all' ||
        (status === 'active' && !['completed','canceled'].includes(task.status)) ||
        task.status === status

      return matchesSearch && matchesStatus
    })
  }, [tasks, search, status])

  const now = Date.now()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'><TbChecklist />Tasks</h1>
          <p className='text-textSecondary mt-2'>Operational work, corrective actions, assignments, due dates, and completion tracking.</p>
        </div>
        {canCreate ? <Button asChild><Link href='/tasks/create'><TbPlus />Create Task</Link></Button> : null}
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_220px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search Tasks...' className='pl-10' />
          </div>
          <select value={status} onChange={event => setStatus(event.target.value)} className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'>
            <option value='active'>Active</option>
            <option value='all'>All</option>
            {['open','in_progress','blocked','completed','canceled'].map(item => (
              <option key={item} value={item}>{statusLabels[item] || item}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(task => {
              const overdue = Boolean(
                task.due_at &&
                new Date(task.due_at).getTime() < now &&
                !['completed','canceled'].includes(task.status)
              )

              return (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className='flex flex-wrap items-center gap-2'>
                      <div className='font-semibold'>{task.title}</div>
                      {task.corrective_action ? <Badge size='sm' variant='outline'>Corrective Action</Badge> : null}
                    </div>
                    <div className='text-textSecondary text-xs'>{task.task_number}{task.source_reference ? ' · ' + task.source_reference : ''}</div>
                  </TableCell>
                  <TableCell>
                    <Badge size='sm' variant={task.priority === 'critical' ? 'destructive' : task.priority === 'high' ? 'secondary' : 'outline'}>
                      {priorityLabels[task.priority] || task.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{statusLabels[task.status] || task.status}</TableCell>
                  <TableCell>{task.assigneeName || '—'}</TableCell>
                  <TableCell>{task.locationName || '—'}</TableCell>
                  <TableCell>
                    <span className={overdue ? 'text-destructive font-semibold' : ''}>
                      {task.due_at ? new Date(task.due_at).toLocaleString() : '—'}
                    </span>
                    {overdue ? <div className='text-destructive text-xs'>Overdue</div> : null}
                  </TableCell>
                  <TableCell className='text-right'><Button size='sm' variant='outline' asChild><Link href={'/tasks/' + task.id}>Open</Link></Button></TableCell>
                </TableRow>
              )
            }) : (
              <TableRow><TableCell colSpan={7} className='py-10 text-center'>No Tasks match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default TaskList
