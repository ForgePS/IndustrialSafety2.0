import type { Metadata } from 'next'
import TrainingRecordForm from '../../TrainingRecordForm'
import { getEffectiveForm } from '@/lib/forgeForms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'New Training Course' }

const CreateCoursePage = async () => {
  const context = await requireTenantPermission('training.create_course')
  const form = await getEffectiveForm({
    organizationId: context.activeOrganization.id,
    formKey: 'training.course'
  })

  if (!form) {
    return <div className='rounded-lg border p-6'>Training Course form is not configured.</div>
  }

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{form.name}</h1>
        <p className='text-textSecondary mt-2'>{form.description}</p>
      </div>

      <TrainingRecordForm form={form} mode='course' />
    </div>
  )
}

export default CreateCoursePage
