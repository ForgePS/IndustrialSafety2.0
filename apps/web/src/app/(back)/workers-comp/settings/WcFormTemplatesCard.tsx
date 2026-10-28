'use client'

import { useRef, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { toast } from '@repo/ui/utils/toast'

import { archiveWcFormTemplate } from './formTemplateActions'

type Slot = {
  formKey: string
  title: string
  description: string
  medical: boolean
  current: { id: string; fileName: string; uploadedAt: string } | null
}

/** Company case forms: upload each original PDF once; cases then offer it to fill, sign, print and email. */
const WcFormTemplatesCard = ({ slots }: { slots: Slot[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const upload = (formKey: string) =>
    startTransition(async () => {
      const file = inputs.current[formKey]?.files?.[0]

      if (!file) {
        toast('error', 'Choose a PDF file.')

        return
      }

      const body = new FormData()

      body.set('formKey', formKey)
      body.set('file', file)

      const response = await fetch('/api/workers-comp/forms/templates', { method: 'POST', body })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast('error', payload.error || 'Upload failed.')

        return
      }

      toast('success', payload.message || 'Form uploaded.')
      if (inputs.current[formKey]) inputs.current[formKey]!.value = ''
      router.refresh()
    })

  const archive = (templateId: string) =>
    startTransition(async () => {
      const result = await archiveWcFormTemplate(templateId)

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Removed.')
      router.refresh()
    })

  return (
    <Card data-testid='wc-form-templates'>
      <CardHeader>
        <CardTitle>Case Forms</CardTitle>
        <CardDescription>
          Upload your company&apos;s own paper forms as PDFs. They are kept unchanged and print exactly as they are; filled-in values and signatures are drawn onto them. A form is offered on cases only after it is uploaded here.
        </CardDescription>
      </CardHeader>
      <CardContent className='grid grid-cols-1 gap-4 md:grid-cols-2'>
        {slots.map(slot => (
          <div key={slot.formKey} className='flex min-w-0 flex-col gap-3 rounded-lg border p-4' data-testid={`wc-form-template-${slot.formKey}`}>
            <div>
              <div className='font-semibold'>{slot.title}</div>
              <p className='text-textSecondary text-sm'>{slot.description}</p>
              {slot.medical ? <p className='text-textSecondary mt-1 text-xs'>Only people with workers&apos; comp medical access can see or fill this form.</p> : null}
            </div>
            {slot.current ? (
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                <span className='break-all'>{slot.current.fileName}</span>
                <span className='text-textSecondary'>· uploaded {new Date(slot.current.uploadedAt).toLocaleDateString()}</span>
                <Button size='sm' variant='outline' asChild><a href={`/api/workers-comp/forms/templates/${slot.current.id}`} target='_blank' rel='noopener'>View</a></Button>
                <Button size='sm' variant='outline' disabled={pending} onClick={() => window.confirm(`Stop offering ${slot.title} on cases?`) && archive(slot.current!.id)}>Remove</Button>
              </div>
            ) : (
              <p className='text-textSecondary text-sm'>Not set up.</p>
            )}
            <div className='flex flex-wrap items-center gap-2'>
              <input
                ref={element => { inputs.current[slot.formKey] = element }}
                aria-label={`${slot.title} PDF`}
                type='file'
                accept='application/pdf,.pdf'
                className='block min-w-0 max-w-full text-sm'
                disabled={pending}
              />
              <Button size='sm' disabled={pending} onClick={() => upload(slot.formKey)}>{slot.current ? 'Replace' : 'Upload'}</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default WcFormTemplatesCard
