import type { Metadata } from 'next'
import Link from 'next/link'

import { authorizeFormData } from '@/app/(back)/forklifts/operators/data'
import AuthorizeOperatorForm from '@/components/forklifts/AuthorizeOperatorForm'
import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import { forkliftRights } from '@/lib/forgeForkliftAccess'
import { isUuid } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Authorize a forklift operator' }

/** Port slice 19: record training and an evaluation and authorize a person for truck classes. */
const NewOperatorPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('forklifts.authorize')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const data = await authorizeFormData(organizationId, rights)
  const query = await searchParams
  const preset = typeof query.person === 'string' && isUuid(query.person) && data.people.some(person => person.id === query.person) ? query.person : ''

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/forklifts/operators' className='text-primary text-sm hover:underline'>
          ← Operators
        </Link>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Authorize an operator</h1>
        <p className='text-textSecondary mt-2'>
          OSHA 1910.178(l): an operator is trained (formal instruction and practical training), evaluated operating the truck in the workplace, and re-evaluated at least every{' '}
          {data.settings.evaluation_months} months.
        </p>
      </div>
      <ForkliftTabs active='operators' canManage={Boolean(rights.manage)} />
      <AuthorizeOperatorForm
        people={data.people}
        evaluators={data.evaluators}
        settings={data.settings}
        today={data.today}
        courseTitle={data.courseTitle}
        initial={{
          personnelId: preset,
          truckClasses: [],
          trainingCompletedOn: '',
          evaluatedOn: data.today,
          evaluatorPersonnelId: '',
          evaluatorName: '',
          evaluationNotes: '',
          restrictions: ''
        }}
      />
    </div>
  )
}

export default NewOperatorPage
