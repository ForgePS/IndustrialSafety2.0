import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'

import { PortalSignIn, PortalSignOut } from '../PortalControls'
import { loadPortal } from '../portalContext'
import { getPortalAssignments } from '@/lib/forgeTrainingLms'

export const metadata: Metadata = { title: 'Training Kiosk', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const Shell = ({ company, children }: { company: string; children: React.ReactNode }) => (
  <main className='bg-background mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10'>
    <div>
      <div className='text-primary text-sm font-semibold uppercase tracking-wide'>{company}</div>
      <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Training Kiosk</h1>
    </div>
    {children}
  </main>
)

const PortalPage = async ({ params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params
  const { link, session } = await loadPortal(token)

  if (!link) {
    return (
      <Shell company='Forge Industrial Safety'>
        <p className='text-textSecondary'>This training kiosk link is not active. Ask your supervisor for the current link.</p>
      </Shell>
    )
  }

  const company = link.organizations?.name || ''

  if (!session) {
    return (
      <Shell company={company}>
        <p className='text-textSecondary'>{link.title}. Enter your employee number to see your assigned training.</p>
        <PortalSignIn token={token} />
      </Shell>
    )
  }

  const person = session.forge_personnel
  const assignments = await getPortalAssignments(link.organization_id, person.id)

  return (
    <Shell company={company}>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-textPrimary text-lg' data-testid='portal-welcome'>Signed in as {person.first_name} {person.last_name}</p>
        <PortalSignOut token={token} />
      </div>
      <ul className='flex flex-col gap-3' data-testid='portal-assignments'>
        {assignments.length ? assignments.map((assignment: any) => (
          <li key={assignment.id} className='bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4'>
            <div>
              <div className='text-textPrimary font-semibold'>{assignment.forge_training_courses?.title}</div>
              <div className='text-textSecondary text-sm'>
                {assignment.due_date ? `Due ${assignment.due_date}` : 'No due date'}
                {assignment.status === 'in_progress' ? ' · In progress' : ''}
                {assignment.status === 'overdue' ? ' · Overdue' : ''}
              </div>
            </div>
            <Button asChild><Link href={`/training-portal/${token}/course/${assignment.id}`}>Open</Link></Button>
          </li>
        )) : <li className='text-textSecondary'>You have no open training with online content. Ask your supervisor if you expected some.</li>}
      </ul>
    </Shell>
  )
}

export default PortalPage
