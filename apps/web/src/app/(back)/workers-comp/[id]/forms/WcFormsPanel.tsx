'use client'

import { useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { toast } from '@repo/ui/utils/toast'

import { createWcCaseForm } from './actions'

type Available = { formKey: string; title: string; description: string; templateId: string; medical: boolean; canStart: boolean }
type Instance = { id: string; title: string; status: string; signerName: string | null; signedDate: string | null; createdAt: string; medical: boolean }

const STATUS_VARIANT: Record<string, 'secondary' | 'tonalSuccess'> = { draft: 'secondary', signed: 'tonalSuccess', voided: 'secondary' }

/** The case's paper forms: start one, print the blank original, or open a filled form. */
const WcFormsPanel = ({ caseId, available, forms }: { caseId: string; available: Available[]; forms: Instance[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const start = (formKey: string) =>
    startTransition(async () => {
      const result = await createWcCaseForm({ caseId, formKey })

      if (result.error || !result.id) {
        toast('error', result.error || 'Unable to start the form.')

        return
      }

      toast('success', result.message || 'Form started.')
      router.push(`/workers-comp/${caseId}/forms/${result.id}`)
    })

  return (
    <Card data-testid='wc-forms'>
      <CardHeader>
        <CardTitle>Forms</CardTitle>
        <CardDescription>Your company&apos;s injury forms. Fill them in and sign on screen, then print or email them exactly like the paper copy.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          {available.map(item => (
            <div key={item.formKey} className='flex min-w-0 flex-col gap-2 rounded-lg border p-4' data-testid={`wc-form-available-${item.formKey}`}>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-semibold'>{item.title}</span>
                {item.medical ? <Badge size='sm' variant='secondary'>Medical access</Badge> : null}
              </div>
              <p className='text-textSecondary text-sm'>{item.description}</p>
              <div className='flex flex-wrap gap-2'>
                {item.canStart ? <Button size='sm' disabled={pending} onClick={() => start(item.formKey)}>Start {item.title}</Button> : null}
                <Button size='sm' variant='outline' asChild>
                  <a href={`/api/workers-comp/forms/templates/${item.templateId}`} target='_blank' rel='noopener'>Print blank form</a>
                </Button>
              </div>
            </div>
          ))}
        </div>

        {forms.length ? (
          <ul className='flex flex-col gap-2' data-testid='wc-form-list'>
            {forms.map(form => (
              <li key={form.id} className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
                <div className='min-w-0'>
                  <Link className='text-primary font-semibold hover:underline' href={`/workers-comp/${caseId}/forms/${form.id}`}>{form.title}</Link>
                  <div className='text-textSecondary text-xs'>
                    {form.status === 'signed' && form.signerName ? `Signed by ${form.signerName} on ${form.signedDate}` : `Started ${new Date(form.createdAt).toLocaleDateString()}`}
                  </div>
                </div>
                <Badge size='sm' variant={STATUS_VARIANT[form.status] || 'secondary'} className='capitalize'>{form.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-textSecondary text-sm'>No forms on this case yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default WcFormsPanel
