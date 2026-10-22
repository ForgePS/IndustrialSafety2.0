import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import TrainingRecordForm from '../../TrainingRecordForm'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Record Training Completion' }

const RecordTrainingCompletionPage = async () => {
  const context = await requireTenantPermission('training.record_completion')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [form, personnel, { data: courses }] = await Promise.all([
    getEffectiveForm({ organizationId, formKey: 'training.completion' }),
    getScopedPersonnel({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    supabase
      .from('forge_training_courses')
      .select('id, title, course_code')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('title')
  ])

  if (!form) return <div className='rounded-lg border p-6'>Training Completion form is not configured.</div>

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{form.name}</h1>
        <p className='text-textSecondary mt-2'>{form.description}</p>
      </div>

      <TrainingRecordForm
        form={form}
        mode='completion'
        courses={(courses || []).map((course: any) => ({
          id: course.id,
          label: course.course_code ? `${course.title} (${course.course_code})` : course.title
        }))}
        personnel={personnel.map((person: any) => ({
          id: person.id,
          label: person.employee_number
            ? `${person.first_name} ${person.last_name} (${person.employee_number})`
            : `${person.first_name} ${person.last_name}`
        }))}
      />
    </div>
  )
}

export default RecordTrainingCompletionPage
