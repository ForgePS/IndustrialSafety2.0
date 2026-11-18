import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { userHoldsFormPermission, lookupSignLink, signerDisplayName, signLinkMessage } from '@/lib/forgeFormSigning'
import { loadFormSubmission } from '@/lib/forgeFormAccess'
import { optionalUserId } from '@/lib/platform/identity'

import SignLinkForm from './SignLinkForm'

export const metadata: Metadata = { title: 'Sign a Form', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const Shell = ({ company, children }: { company: string; children: React.ReactNode }) => (
  <main className='bg-background mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10'>
    <div>
      <div className='text-primary text-sm font-semibold uppercase tracking-wide'>{company}</div>
      <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Sign a Form</h1>
    </div>
    {children}
  </main>
)

const Notice = ({ state, children }: { state: string; children: React.ReactNode }) => (
  <p className='text-textSecondary' role='alert' data-testid='sign-unavailable' data-state={state}>
    {children}
  </p>
)

/**
 * Public sign-link page (Industrial 1.0 "send link to sign"). Outside (back): the token is the authority.
 *
 * - Supervisor link: no sign-in. The signer reads the answers, types their name and signs.
 * - EHS Director link: the signer must be signed in as the user the link was sent to (a signed-out visitor
 *   goes to sign-in and comes back here), because only a holder of the Sign as EHS Director permission may
 *   sign that field. The server re-checks this on submit.
 */
const SignPage = async ({ params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params
  const lookup = await lookupSignLink(token)

  if (lookup.state !== 'ready') {
    return (
      <Shell company='Forge Industrial Safety'>
        <Notice state={lookup.state}>{signLinkMessage(lookup.state)}</Notice>
      </Shell>
    )
  }

  const { summary } = lookup
  const director = summary.field.signatory === 'ehs_director'
  let directorName: string | null = null

  if (director) {
    const userId = await optionalUserId()

    if (!userId) redirect('/auth/login?next=' + encodeURIComponent('/sign/' + token))

    if (userId !== summary.requestedForUserId) {
      return (
        <Shell company={summary.organizationName}>
          <Notice state='wrong_user'>
            This link was sent to {summary.requestedForName || 'another user'}. Sign out and sign in as them to sign it.
          </Notice>
        </Shell>
      )
    }

    const loaded = await loadFormSubmission({ organizationId: summary.organizationId, submissionId: summary.submissionId })

    const allowed =
      loaded && (await userHoldsFormPermission({ organizationId: summary.organizationId, userId, permissionKey: 'forms.sign_director', submission: loaded.submission }))

    if (!allowed) {
      return (
        <Shell company={summary.organizationName}>
          <Notice state='not_director'>Your account cannot sign as EHS Director for this form. Ask your administrator for the Sign as EHS Director permission.</Notice>
        </Shell>
      )
    }

    directorName = await signerDisplayName(userId)
  }

  return (
    <Shell company={summary.organizationName}>
      <section className='bg-card flex flex-col gap-3 rounded-lg border p-4' data-testid='sign-summary'>
        <div className='text-textSecondary text-sm'>{summary.submissionNumber}</div>
        <h2 className='text-textPrimary text-xl font-semibold'>{summary.formTitle}</h2>
        {summary.answers.length ? (
          <dl className='grid gap-3 text-sm sm:grid-cols-2' data-testid='sign-answers'>
            {summary.answers.map((answer, index) => (
              <div key={index} className='min-w-0'>
                <dt className='text-textSecondary'>{answer.label}</dt>
                <dd className='text-textPrimary whitespace-pre-wrap break-words font-medium'>{answer.value || '—'}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
      <SignLinkForm
        token={token}
        fieldLabel={summary.field.label}
        defaultName={director ? directorName || '' : summary.requestedForName || ''}
        nameLocked={director}
      />
      <p className='text-textSecondary text-xs'>This link expires {new Date(summary.expiresAt).toLocaleDateString()} and can be used once.</p>
    </Shell>
  )
}

export default SignPage
