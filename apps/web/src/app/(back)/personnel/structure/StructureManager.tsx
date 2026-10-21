'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { toast } from '@repo/ui/utils/toast'

import { saveDepartment, savePosition, setDepartmentActive, setPositionActive } from './actions'

type Option = { id: string; label: string }

export type DepartmentRow = {
  id: string
  name: string
  code: string | null
  description: string | null
  locationId: string | null
  divisionId: string | null
  contactPersonnelId: string | null
  isActive: boolean
  personnelCount: number
}

export type PositionRow = {
  id: string
  name: string
  code: string | null
  description: string | null
  departmentId: string | null
  isActive: boolean
  personnelCount: number
}

const emptyDepartment = { id: '', name: '', code: '', description: '', location_id: '', division_id: '', contact_personnel_id: '' }
const emptyPosition = { id: '', name: '', code: '', description: '', department_id: '' }

const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const StructureManager = ({
  departments,
  positions,
  locations,
  divisions,
  people
}: {
  departments: DepartmentRow[]
  positions: PositionRow[]
  locations: Option[]
  divisions: Option[]
  people: Option[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [department, setDepartment] = useState(emptyDepartment)
  const [position, setPosition] = useState(emptyPosition)

  const nameOf = (options: Option[], id: string | null) => (id ? options.find(item => item.id === id)?.label || '—' : '—')
  const departmentOptions = departments.map(item => ({ id: item.id, label: item.code ? `${item.name} (${item.code})` : item.name }))

  const run = (action: () => Promise<{ error?: string; message?: string }>, after?: () => void) => {
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)
        
return
      }

      toast('success', result.message || 'Saved.')
      after?.()
      router.refresh()
    })
  }

  const submitDepartment = () => {
    const { id, ...values } = department

    run(() => saveDepartment({ ...values, ...(id ? { id } : {}) }), () => setDepartment(emptyDepartment))
  }

  const submitPosition = () => {
    const { id, ...values } = position

    run(() => savePosition({ ...values, ...(id ? { id } : {}) }), () => setPosition(emptyPosition))
  }

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>{department.id ? 'Edit Department' : 'Add Department'}</CardTitle>
          <CardDescription>Department names must be unique within a Location.</CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          <div className='md:col-span-5'>
            <Label htmlFor='department-name'>Department Name</Label>
            <Input id='department-name' className='mt-2' value={department.name} disabled={pending} onChange={event => setDepartment(current => ({ ...current, name: event.target.value }))} />
          </div>
          <div className='md:col-span-2'>
            <Label htmlFor='department-code'>Code</Label>
            <Input id='department-code' className='mt-2' value={department.code} disabled={pending} onChange={event => setDepartment(current => ({ ...current, code: event.target.value }))} />
          </div>
          <div className='md:col-span-5'>
            <Label htmlFor='department-contact'>Department Contact</Label>
            <select id='department-contact' className={selectClass} value={department.contact_personnel_id} disabled={pending} onChange={event => setDepartment(current => ({ ...current, contact_personnel_id: event.target.value }))}>
              <option value=''>No contact</option>
              {people.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className='md:col-span-6'>
            <Label htmlFor='department-location'>Location</Label>
            <select id='department-location' className={selectClass} value={department.location_id} disabled={pending} onChange={event => setDepartment(current => ({ ...current, location_id: event.target.value }))}>
              <option value=''>All Locations</option>
              {locations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className='md:col-span-6'>
            <Label htmlFor='department-division'>Division</Label>
            <select id='department-division' className={selectClass} value={department.division_id} disabled={pending} onChange={event => setDepartment(current => ({ ...current, division_id: event.target.value }))}>
              <option value=''>No Division</option>
              {divisions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className='md:col-span-12'>
            <Label htmlFor='department-description'>Description</Label>
            <Input id='department-description' className='mt-2' value={department.description} disabled={pending} onChange={event => setDepartment(current => ({ ...current, description: event.target.value }))} />
          </div>
          <div className='flex flex-wrap gap-3 md:col-span-12'>
            <Button disabled={pending} onClick={submitDepartment}>{department.id ? 'Save Department' : 'Add Department'}</Button>
            {department.id ? <Button variant='tonalDefault' disabled={pending} onClick={() => setDepartment(emptyDepartment)}>Cancel</Button> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>People</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.length ? departments.map(item => (
              <TableRow key={item.id} data-testid={`department-row-${item.name}`}>
                <TableCell>
                  <div className='text-textPrimary font-semibold'>{item.name}{item.code ? ` (${item.code})` : ''}</div>
                  {!item.isActive ? <Badge size='sm' variant='secondary'>Inactive</Badge> : null}
                </TableCell>
                <TableCell>{nameOf(locations, item.locationId)}</TableCell>
                <TableCell>{nameOf(divisions, item.divisionId)}</TableCell>
                <TableCell>{nameOf(people, item.contactPersonnelId)}</TableCell>
                <TableCell>{item.personnelCount}</TableCell>
                <TableCell className='text-right'>
                  <div className='flex justify-end gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={pending}
                      onClick={() => setDepartment({
                        id: item.id,
                        name: item.name,
                        code: item.code || '',
                        description: item.description || '',
                        location_id: item.locationId || '',
                        division_id: item.divisionId || '',
                        contact_personnel_id: item.contactPersonnelId || ''
                      })}
                    >
                      Edit
                    </Button>
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => setDepartmentActive({ id: item.id, active: !item.isActive }))}>
                      {item.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className='py-8 text-center'>No departments yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{position.id ? 'Edit Position' : 'Add Position'}</CardTitle>
          <CardDescription>Leave Department blank for a position used across the company.</CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          <div className='md:col-span-5'>
            <Label htmlFor='position-name'>Position Name</Label>
            <Input id='position-name' className='mt-2' value={position.name} disabled={pending} onChange={event => setPosition(current => ({ ...current, name: event.target.value }))} />
          </div>
          <div className='md:col-span-2'>
            <Label htmlFor='position-code'>Code</Label>
            <Input id='position-code' className='mt-2' value={position.code} disabled={pending} onChange={event => setPosition(current => ({ ...current, code: event.target.value }))} />
          </div>
          <div className='md:col-span-5'>
            <Label htmlFor='position-department'>Department</Label>
            <select id='position-department' className={selectClass} value={position.department_id} disabled={pending} onChange={event => setPosition(current => ({ ...current, department_id: event.target.value }))}>
              <option value=''>Company-wide</option>
              {departmentOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className='md:col-span-12'>
            <Label htmlFor='position-description'>Description</Label>
            <Input id='position-description' className='mt-2' value={position.description} disabled={pending} onChange={event => setPosition(current => ({ ...current, description: event.target.value }))} />
          </div>
          <div className='flex flex-wrap gap-3 md:col-span-12'>
            <Button disabled={pending} onClick={submitPosition}>{position.id ? 'Save Position' : 'Add Position'}</Button>
            {position.id ? <Button variant='tonalDefault' disabled={pending} onClick={() => setPosition(emptyPosition)}>Cancel</Button> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>People</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.length ? positions.map(item => (
              <TableRow key={item.id} data-testid={`position-row-${item.name}`}>
                <TableCell>
                  <div className='text-textPrimary font-semibold'>{item.name}{item.code ? ` (${item.code})` : ''}</div>
                  {!item.isActive ? <Badge size='sm' variant='secondary'>Inactive</Badge> : null}
                </TableCell>
                <TableCell>{item.departmentId ? nameOf(departmentOptions, item.departmentId) : 'Company-wide'}</TableCell>
                <TableCell>{item.personnelCount}</TableCell>
                <TableCell className='text-right'>
                  <div className='flex justify-end gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={pending}
                      onClick={() => setPosition({
                        id: item.id,
                        name: item.name,
                        code: item.code || '',
                        description: item.description || '',
                        department_id: item.departmentId || ''
                      })}
                    >
                      Edit
                    </Button>
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => setPositionActive({ id: item.id, active: !item.isActive }))}>
                      {item.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={4} className='py-8 text-center'>No positions yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <div>
        <Button variant='tonalDefault' asChild><Link href='/personnel'>Back to Personnel</Link></Button>
      </div>
    </div>
  )
}

export default StructureManager
