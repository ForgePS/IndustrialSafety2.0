import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getMyTraining } from '@/lib/forgeTraining'
import { getEffectiveLookup } from '@/lib/forgeLookups'

export const metadata: Metadata = { title: 'My Training' }

const MyTrainingPage = async () => {
  const context = await requireTenantPermission('my_training.view')
  const organizationId = context.activeOrganization.id

  const [data, statusLookup, resultLookup, approvalLookup, deliveryLookup] = await Promise.all([
    getMyTraining({ organizationId, userId: context.user.id }),
    getEffectiveLookup({ organizationId, lookupKey: 'training.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'training.result' }),
    getEffectiveLookup({ organizationId, lookupKey: 'training.approval_status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'training.delivery_method' })
  ])

  const statusLabels = Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))
  const resultLabels = Object.fromEntries(resultLookup.options.map(option => [option.key, option.label]))
  const approvalLabels = Object.fromEntries(approvalLookup.options.map(option => [option.key, option.label]))
  const deliveryLabels = Object.fromEntries(deliveryLookup.options.map(option => [option.key, option.label]))

  if (!data.personnel) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Training</CardTitle>
          <CardDescription>Your login is not linked to a Personnel record for this company.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name}</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>My Training</h1>
        <p className='text-textSecondary mt-2'>
          {data.personnel.first_name} {data.personnel.last_name} · assignments, transcript and current completion status.
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card><CardHeader className='pb-2'><CardDescription>Assigned</CardDescription></CardHeader><CardContent><div className='text-3xl font-semibold'>{data.assignments.filter((item: any) => item.status !== 'completed').length}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Completed</CardDescription></CardHeader><CardContent><div className='text-3xl font-semibold'>{data.completions.length}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Approved Records</CardDescription></CardHeader><CardContent><div className='text-3xl font-semibold'>{data.completions.filter((item: any) => item.approval_status === 'approved').length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Training</CardTitle>
          <CardDescription>Training currently assigned to you.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.assignments.length ? data.assignments.map((item: any) => {
              const overdue = item.due_date && item.due_date < today && item.status !== 'completed'
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className='font-semibold'>{item.forge_training_courses?.title || 'Unknown course'}</div>
                    <div className='text-textSecondary text-xs'>{item.forge_training_courses?.course_code || 'No course code'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge size='sm' variant={item.status === 'completed' ? 'tonalSuccess' : overdue ? 'destructive' : 'secondary'}>
                      {overdue ? 'Overdue' : statusLabels[item.status] || item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.due_date || '—'}</TableCell>
                  <TableCell>{item.forge_training_courses?.delivery_method ? deliveryLabels[item.forge_training_courses.delivery_method] || item.forge_training_courses.delivery_method : '—'}</TableCell>
                  <TableCell>{item.forge_training_courses?.duration_minutes ? String(item.forge_training_courses.duration_minutes) + ' min' : '—'}</TableCell>
                </TableRow>
              )
            }) : (
              <TableRow><TableCell colSpan={5} className='py-10 text-center'>No training is currently assigned.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Training Transcript</CardTitle>
          <CardDescription>Recorded completions and approval status.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.completions.length ? data.completions.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className='font-semibold'>{item.forge_training_courses?.title || 'Unknown course'}</div>
                  <div className='text-textSecondary text-xs'>{item.certificate_number || 'No certificate number'}</div>
                </TableCell>
                <TableCell>{new Date(item.completed_at).toLocaleDateString()}</TableCell>
                <TableCell>{resultLabels[item.result] || item.result}</TableCell>
                <TableCell>{item.hours ?? '—'}</TableCell>
                <TableCell><Badge size='sm' variant={item.approval_status === 'approved' ? 'tonalSuccess' : 'secondary'}>{approvalLabels[item.approval_status] || item.approval_status}</Badge></TableCell>
                <TableCell>{item.expires_at || 'Does not expire'}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className='py-10 text-center'>No completed training records yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default MyTrainingPage
