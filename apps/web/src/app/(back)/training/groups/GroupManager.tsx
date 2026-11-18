'use client'

import { useMemo, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import {
  addGroupMembers,
  addGroupRequirement,
  assignGroupTraining,
  removeGroupMember,
  removeGroupRequirement,
  saveTrainingGroup,
  setTrainingGroupActive
} from './actions'

type Option = { id: string; label: string }
type Group = { id: string; name: string; description: string | null; isActive: boolean; memberCount: number; requirementCount: number }

const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const GroupManager = ({
  groups,
  selected,
  members,
  requirements,
  people,
  courses,
  canAssign
}: {
  groups: Group[]
  selected: Group | null
  members: Option[]
  requirements: Option[]
  people: Option[]
  courses: Option[]
  canAssign: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [courseId, setCourseId] = useState('')
  const [dueDate, setDueDate] = useState('')

  const run = (action: () => Promise<{ error?: string; message?: string; id?: string }>, after?: (id?: string) => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      after?.(result.id)
      router.refresh()
    })

  const memberIds = useMemo(() => new Set(members.map(member => member.id)), [members])
  const candidates = people.filter(person => !memberIds.has(person.id) && person.label.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 50)
  const requiredIds = new Set(requirements.map(item => item.id))

  return (
    <div className='grid gap-6 lg:grid-cols-[320px_1fr]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardHeader><CardTitle>Groups</CardTitle></CardHeader>
          <CardContent className='flex flex-col gap-2' data-testid='training-groups-list'>
            {groups.length ? groups.map(group => (
              <Link
                key={group.id}
                href={`/training/groups?group=${group.id}`}
                className={`rounded-md border p-3 text-sm hover:bg-black/5 ${selected?.id === group.id ? 'border-primary' : ''}`}
              >
                <div className='font-semibold'>{group.name} {group.isActive ? null : <Badge size='sm' variant='secondary'>Inactive</Badge>}</div>
                <div className='text-textSecondary'>{group.memberCount} people · {group.requirementCount} required courses</div>
              </Link>
            )) : <p className='text-textSecondary text-sm'>No groups yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>New Group</CardTitle><CardDescription>For example a department, crew or job role.</CardDescription></CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <div>
              <Label htmlFor='group-name'>Name</Label>
              <Input id='group-name' className='mt-2' value={name} disabled={pending} onChange={event => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor='group-description'>Description</Label>
              <Input id='group-description' className='mt-2' value={description} disabled={pending} onChange={event => setDescription(event.target.value)} />
            </div>
            <div>
              <Button disabled={pending || !name.trim()} onClick={() => run(() => saveTrainingGroup({ values: { name, description } }), id => { setName(''); setDescription(''); if (id) router.push(`/training/groups?group=${id}`) })}>
                Create Group
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {selected ? (
        <div className='flex flex-col gap-6' data-testid='training-group-detail'>
          <Card>
            <CardHeader>
              <CardTitle>{selected.name}</CardTitle>
              {selected.description ? <CardDescription>{selected.description}</CardDescription> : null}
            </CardHeader>
            <CardContent className='flex flex-wrap gap-3'>
              <Button variant='outline' disabled={pending} onClick={() => run(() => setTrainingGroupActive({ groupId: selected.id, active: !selected.isActive }))}>
                {selected.isActive ? 'Deactivate Group' : 'Reactivate Group'}
              </Button>
              <Button variant='outline' asChild><Link href={`/training/matrix?group=${selected.id}`}>View in Matrix</Link></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Required Courses</CardTitle>
              <CardDescription>Everyone in the group must hold a current completion of each required course.</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              <ul className='flex flex-col gap-2' data-testid='group-requirements'>
                {requirements.map(item => (
                  <li key={item.id} className='flex items-center justify-between gap-3 rounded-md border p-2 text-sm'>
                    {item.label}
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => removeGroupRequirement({ groupId: selected.id, courseId: item.id }))}>Remove</Button>
                  </li>
                ))}
              </ul>
              <div className='flex flex-wrap items-end gap-3'>
                <div className='min-w-[240px] flex-1'>
                  <Label htmlFor='group-course'>Add a required course</Label>
                  <select id='group-course' className={selectClass} value={courseId} disabled={pending} onChange={event => setCourseId(event.target.value)}>
                    <option value=''>Choose a course...</option>
                    {courses.filter(course => !requiredIds.has(course.id)).map(course => <option key={course.id} value={course.id}>{course.label}</option>)}
                  </select>
                </div>
                <Button disabled={pending || !courseId} onClick={() => run(() => addGroupRequirement({ groupId: selected.id, courseId }), () => setCourseId(''))}>Add Course</Button>
              </div>
              {canAssign && requirements.length && members.length ? (
                <div className='flex flex-wrap items-end gap-3 border-t pt-3'>
                  <div>
                    <Label htmlFor='group-due'>Due date (optional)</Label>
                    <Input id='group-due' type='date' className='mt-2' value={dueDate} disabled={pending} onChange={event => setDueDate(event.target.value)} />
                  </div>
                  <Button disabled={pending} onClick={() => run(() => assignGroupTraining({ groupId: selected.id, dueDate }))}>Assign Required Training</Button>
                  <p className='text-textSecondary w-full text-xs'>Creates assignments for members who are missing a required course, expired, or expiring within 30 days. People already assigned or current are skipped.</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Members ({members.length})</CardTitle></CardHeader>
            <CardContent className='flex flex-col gap-3'>
              <ul className='flex flex-col gap-2' data-testid='group-members'>
                {members.map(member => (
                  <li key={member.id} className='flex items-center justify-between gap-3 rounded-md border p-2 text-sm'>
                    {member.label}
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => removeGroupMember({ groupId: selected.id, personnelId: member.id }))}>Remove</Button>
                  </li>
                ))}
              </ul>
              <div className='border-t pt-3'>
                <Label htmlFor='group-member-search'>Add people</Label>
                <Input id='group-member-search' className='mt-2' placeholder='Search by name or employee number' value={search} disabled={pending} onChange={event => setSearch(event.target.value)} />
                <div className='mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto'>
                  {candidates.map(person => (
                    <label key={person.id} className='flex items-center gap-2 text-sm'>
                      <input type='checkbox' checked={picked.includes(person.id)} disabled={pending} onChange={() => setPicked(current => (current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id]))} />
                      {person.label}
                    </label>
                  ))}
                </div>
                <Button className='mt-3' disabled={pending || !picked.length} onClick={() => run(() => addGroupMembers({ groupId: selected.id, personnelIds: picked }), () => setPicked([]))}>
                  Add {picked.length || ''} {picked.length === 1 ? 'Person' : 'People'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card><CardContent className='p-6'>Choose a group, or create one.</CardContent></Card>
      )}
    </div>
  )
}

export default GroupManager
