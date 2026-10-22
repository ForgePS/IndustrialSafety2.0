import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getComplianceMatrix } from '@/lib/forgeTrainingLms'
import { MATRIX_STATUS_LABELS } from '@/lib/forgeTrainingRules'
import type { MatrixStatus } from '@/lib/forgeTrainingRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Training Compliance Matrix' }

const STATUS_CLASS: Record<MatrixStatus, string> = {
  current: 'bg-success/15 text-success',
  expiring: 'bg-warning/20 text-warning',
  expired: 'bg-destructive/15 text-destructive',
  overdue: 'bg-destructive/15 text-destructive',
  assigned: 'bg-primary/15 text-primary',
  missing: 'bg-destructive/10 text-destructive',
  not_required: 'text-textSecondary'
}

const TrainingMatrixPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) => {
  const context = await requireTenantPermission('training.view')
  const organizationId = context.activeOrganization.id
  const params = await searchParams
  const groupId = params.group || null
  const allCourses = params.courses === 'all'

  const supabase = createServiceRoleClient() as any
  const { data: groups } = await supabase.from('forge_training_groups').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name')

  const matrix = await getComplianceMatrix({ organizationId, userId: context.user.id, personnelPermission: context.permission, groupId, allCourses })

  const totals = { current: 0, expiring: 0, gaps: 0 }

  for (const row of matrix.rows) {
    for (const cell of Object.values(row.cells)) {
      if (cell.status === 'current') totals.current += 1
      else if (cell.status === 'expiring') totals.expiring += 1
      else if (cell.status === 'expired' || cell.status === 'missing' || cell.status === 'overdue') totals.gaps += 1
    }
  }

  const canExport = context.access.effective.some(item => item.permissionKey === 'training.export' && item.allowed)
  const query = new URLSearchParams({ ...(groupId ? { group: groupId } : {}), ...(allCourses ? { courses: 'all' } : {}) }).toString()

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Compliance Matrix</h1>
          <p className='text-textSecondary mt-2'>Required courses come from training groups. Expiring means within 30 days.</p>
        </div>
        <div className='flex flex-wrap gap-3'>
          {canExport ? <Button variant='outline' asChild><a href={`/api/training/matrix${query ? `?${query}` : ''}`}>Download CSV</a></Button> : null}
          <Button variant='tonalDefault' asChild><Link href='/training'>Back to Training</Link></Button>
        </div>
      </div>

      <Card>
        <CardContent className='p-5'>
          <form method='get' action='/training/matrix' className='grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end'>
            <label className='flex flex-col gap-2 text-sm'>
              <span className='text-textSecondary'>Group</span>
              <select name='group' defaultValue={groupId || ''} className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'>
                <option value=''>Everyone in my scope</option>
                {(groups || []).map((group: any) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label className='flex flex-col gap-2 text-sm'>
              <span className='text-textSecondary'>Courses</span>
              <select name='courses' defaultValue={allCourses ? 'all' : ''} className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'>
                <option value=''>Required courses</option>
                <option value='all'>All active courses</option>
              </select>
            </label>
            <Button type='submit' variant='outline'>Apply</Button>
          </form>
        </CardContent>
      </Card>

      <div className='grid gap-4 sm:grid-cols-3'>
        <Card><CardHeader className='pb-2'><CardDescription>Current</CardDescription></CardHeader><CardContent><div className='text-2xl font-bold'>{totals.current}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Expiring within 30 days</CardDescription></CardHeader><CardContent><div className='text-2xl font-bold'>{totals.expiring}</div></CardContent></Card>
        <Card><CardHeader className='pb-2'><CardDescription>Gaps (missing, expired, overdue)</CardDescription></CardHeader><CardContent><div className='text-2xl font-bold' data-testid='matrix-gaps'>{totals.gaps}</div></CardContent></Card>
      </div>

      <Card className='min-w-0 [contain:inline-size]'>
        <CardHeader><CardTitle>{matrix.rows.length} people · {matrix.columns.length} courses</CardTitle></CardHeader>
        <CardContent className='overflow-x-auto p-0'>
          {matrix.columns.length ? (
            <table className='w-full border-collapse text-sm' data-testid='training-matrix'>
              <thead>
                <tr>
                  <th className='bg-card sticky left-0 border-b p-2 text-left'>Person</th>
                  {matrix.columns.map((course: any) => <th key={course.id} className='min-w-[120px] border-b p-2 text-left'>{course.title}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map(row => (
                  <tr key={row.personnelId} data-testid={`matrix-row-${row.personnelId}`}>
                    <td className='bg-card sticky left-0 border-b p-2'>
                      <Link className='text-primary hover:underline' href={`/personnel/${row.personnelId}`}>{row.name}</Link>
                      {row.employeeNumber ? <div className='text-textSecondary text-xs'>{row.employeeNumber}</div> : null}
                    </td>
                    {matrix.columns.map((course: any) => {
                      const cell = row.cells[course.id]

                      return (
                        <td key={course.id} className='border-b p-1'>
                          <div className={`rounded px-2 py-1 text-xs font-medium ${STATUS_CLASS[cell.status]}`} title={cell.expiresAt ? `Expires ${cell.expiresAt}` : cell.dueDate ? `Due ${cell.dueDate}` : undefined}>
                            {MATRIX_STATUS_LABELS[cell.status]}
                            {cell.expiresAt && cell.status !== 'not_required' ? <div className='font-normal opacity-80'>{cell.expiresAt}</div> : null}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary p-6'>No required courses for these people yet. Add required courses to a training group, or show all active courses.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default TrainingMatrixPage
