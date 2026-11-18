import { createServiceRoleClient } from '@repo/supabase/server'

/** Loads what a certificate shows. Returns null for anything that is not an approved pass. */
export const loadCertificate = async (organizationId: string, completionId: string) => {
  const supabase = createServiceRoleClient() as any

  const { data: completion } = await supabase
    .from('forge_training_completions')
    .select('*, forge_training_courses(title, course_code), forge_personnel(id, first_name, last_name, employee_number, auth_user_id, location_id, division_id, organization_id, supervisor_user_id)')
    .eq('organization_id', organizationId)
    .eq('id', completionId)
    .maybeSingle()

  if (!completion || completion.approval_status !== 'approved' || !['passed', 'completed'].includes(completion.result)) return null

  const [{ data: settings }, { data: organization }] = await Promise.all([
    supabase.from('forge_training_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle()
  ])

  return { completion, settings, organizationName: organization?.name || '' }
}

const formatDate = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '')

const TrainingCertificate = ({ certificate }: { certificate: NonNullable<Awaited<ReturnType<typeof loadCertificate>>> }) => {
  const { completion, settings, organizationName } = certificate
  const person = completion.forge_personnel
  const course = completion.forge_training_courses

  return (
    <div
      className='mx-auto w-full max-w-3xl rounded-lg border-4 border-double bg-white p-10 text-center text-neutral-900 print:border-8'
      data-testid='training-certificate'
    >
      <div className='text-sm uppercase tracking-[0.3em] text-neutral-500'>{organizationName}</div>
      <h1 className='mt-4 text-4xl font-bold'>{settings?.certificate_title || 'Certificate of Completion'}</h1>
      <p className='mt-8 text-neutral-600'>This certifies that</p>
      <p className='mt-2 text-3xl font-semibold'>{person ? `${person.first_name} ${person.last_name}` : ''}</p>
      {person?.employee_number ? <p className='text-sm text-neutral-500'>Employee {person.employee_number}</p> : null}
      <p className='mt-6 text-neutral-600'>has successfully completed</p>
      <p className='mt-2 text-2xl font-semibold'>{course?.title}</p>
      <div className='mt-8 grid gap-2 text-sm sm:grid-cols-3'>
        <div><div className='text-neutral-500'>Completed</div><div className='font-medium'>{formatDate(completion.completed_at)}</div></div>
        <div><div className='text-neutral-500'>Valid until</div><div className='font-medium'>{completion.expires_at ? formatDate(completion.expires_at) : 'Does not expire'}</div></div>
        <div><div className='text-neutral-500'>Certificate</div><div className='font-medium'>{completion.certificate_number || '—'}</div></div>
      </div>
      {completion.score !== null ? <p className='mt-4 text-sm text-neutral-500'>Score {Math.round(Number(completion.score))}%</p> : null}
      {settings?.signer_name ? (
        <div className='mx-auto mt-12 w-64 border-t pt-2 text-sm'>
          <div className='font-medium'>{settings.signer_name}</div>
          {settings.signer_title ? <div className='text-neutral-500'>{settings.signer_title}</div> : null}
        </div>
      ) : null}
      {settings?.footer_text ? <p className='mt-8 text-xs text-neutral-500'>{settings.footer_text}</p> : null}
    </div>
  )
}

export default TrainingCertificate
