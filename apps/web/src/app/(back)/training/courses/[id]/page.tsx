import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import TrainingRecordForm from '../../TrainingRecordForm'
import type { TrainingFormValues } from '../../actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Training Course' }

const TrainingCoursePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('training.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: course }, form] = await Promise.all([
    supabase
      .from('forge_training_courses')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle(),
    getEffectiveForm({ organizationId, formKey: 'training.course' })
  ])

  if (!course || !form) notFound()

  const canEdit = context.access.effective.some(
    item => item.permissionKey === 'training.create_course' && item.allowed
  )

  const values: TrainingFormValues = {
    course_code: course.course_code || '',
    title: course.title,
    description: course.description || '',
    category_key: course.category_key || '',
    delivery_method: course.delivery_method || '',
    duration_minutes: course.duration_minutes == null ? '' : String(course.duration_minutes),
    validity_months: course.validity_months == null ? '' : String(course.validity_months)
  }

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training Course</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{course.title}</h1>
        <p className='text-textSecondary mt-2'>{canEdit ? 'Edit the course using the tenant-configured Training form.' : 'Your role has view-only access to this course.'}</p>
      </div>

      {canEdit ? (
        <TrainingRecordForm form={form} mode='course' courseId={course.id} initialValues={values} />
      ) : (
        <div className='grid gap-4 rounded-lg border p-6 md:grid-cols-2'>
          <div><div className='text-textSecondary text-xs'>Course Code</div><div className='font-medium'>{course.course_code || '—'}</div></div>
          <div><div className='text-textSecondary text-xs'>Category</div><div className='font-medium'>{course.category_key || '—'}</div></div>
          <div><div className='text-textSecondary text-xs'>Delivery</div><div className='font-medium'>{course.delivery_method || '—'}</div></div>
          <div><div className='text-textSecondary text-xs'>Duration</div><div className='font-medium'>{course.duration_minutes ? `${course.duration_minutes} minutes` : '—'}</div></div>
          <div className='md:col-span-2'><div className='text-textSecondary text-xs'>Description</div><div className='font-medium'>{course.description || '—'}</div></div>
        </div>
      )}
    </div>
  )
}

export default TrainingCoursePage
