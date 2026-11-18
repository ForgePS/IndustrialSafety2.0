import type { Metadata } from 'next'

import { closeoutLookupMessage, lookupCloseoutToken } from '@/lib/forgeCapaCloseout'

import CloseoutForm from './CloseoutForm'

export const metadata: Metadata = { title: 'Corrective Action Closeout', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const Shell = ({ company, children }: { company: string; children: React.ReactNode }) => (
  <main className='bg-background mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10'>
    <div>
      <div className='text-primary text-sm font-semibold uppercase tracking-wide'>{company}</div>
      <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Corrective Action Closeout</h1>
    </div>
    {children}
  </main>
)

/** Public closeout page (Industrial 1.0 /closeout/[token]). No sign-in; the token is the credential. */
const CloseoutPage = async ({ params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params
  const lookup = await lookupCloseoutToken(token)

  if (lookup.state !== 'ready') {
    return (
      <Shell company='Forge Industrial Safety'>
        <p className='text-textSecondary' role='alert' data-testid='closeout-unavailable' data-state={lookup.state}>
          {closeoutLookupMessage(lookup.state)}
        </p>
      </Shell>
    )
  }

  const { summary } = lookup

  return (
    <Shell company={summary.organizationName}>
      <section className='bg-card flex flex-col gap-3 rounded-lg border p-4' data-testid='closeout-summary'>
        <div className='text-textSecondary text-sm'>{summary.actionNumber}</div>
        <h2 className='text-textPrimary text-xl font-semibold'>{summary.title}</h2>
        {summary.description ? <p className='text-textPrimary whitespace-pre-wrap text-sm'>{summary.description}</p> : null}
        <dl className='grid gap-2 text-sm sm:grid-cols-2'>
          <div>
            <dt className='text-textSecondary'>Location</dt>
            <dd className='text-textPrimary font-medium'>{summary.locationName || '—'}</dd>
          </div>
          <div>
            <dt className='text-textSecondary'>Due</dt>
            <dd className='text-textPrimary font-medium'>{summary.dueAt ? new Date(summary.dueAt).toLocaleDateString() : 'No due date'}</dd>
          </div>
        </dl>
      </section>
      <CloseoutForm token={token} />
      <p className='text-textSecondary text-xs'>This link expires {new Date(summary.expiresAt).toLocaleDateString()} and can be used once.</p>
    </Shell>
  )
}

export default CloseoutPage
