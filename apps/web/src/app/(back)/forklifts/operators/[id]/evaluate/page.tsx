import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { authorizeFormData } from '@/app/(back)/forklifts/operators/data'
import AuthorizeOperatorForm from '@/components/forklifts/AuthorizeOperatorForm'
import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import { covers, forkliftRights, loadOperator } from '@/lib/forgeForkliftAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Record a forklift evaluation' }

/** Port slice 19: a new evaluation for an existing operator. It restarts the clock and clears a refresher or suspension. */
const EvaluateOperatorPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('forklifts.authorize')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const operator = await loadOperator(organizationId, rights, id)

  if (!operator || !covers(rights.authorize, operator.person.locationId)) notFound()

  const data = await authorizeFormData(organizationId, rights)
  const people = data.people.filter(person => person.id === operator.personnel_id)

  if (!people.length) notFound()

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href={`/forklifts/operators/${operator.id}`} className='text-primary text-sm hover:underline'>
          ← {operator.person.name}
        </Link>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Record a new evaluation</h1>
        <p className='text-textSecondary mt-2'>
          A new evaluation authorizes {operator.person.name} again for {data.settings.evaluation_months} months from the evaluation date. It clears a refresher requirement or a
          suspension, and re-authorizes a revoked operator.
        </p>
      </div>
      <ForkliftTabs active='operators' canManage={Boolean(rights.manage)} />
      <AuthorizeOperatorForm
        fixedPerson
        people={people}
        evaluators={data.evaluators}
        settings={data.settings}
        today={data.today}
        courseTitle={data.courseTitle}
        initial={{
          personnelId: operator.personnel_id,
          truckClasses: operator.truck_classes,
          trainingCompletedOn: operator.training_completed_on,
          evaluatedOn: data.today,
          evaluatorPersonnelId: '',
          evaluatorName: '',
          evaluationNotes: '',
          restrictions: operator.restrictions || ''
        }}
      />
    </div>
  )
}

export default EvaluateOperatorPage
