'use client'

import { useMemo, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { emailWcCaseForm, saveWcCaseFormDraft, signWcCaseForm, voidWcCaseForm } from '../actions'
import SignaturePad from '@/components/common/SignaturePad'

type Field = { key: string; label: string; kind: 'text' | 'date' | 'initials'; maxLength: number; required?: boolean }

type FormView = {
  id: string
  rowVersion: number
  status: 'draft' | 'signed' | 'voided'
  formKey: string
  title: string
  medical: boolean
  signerLabel: string
  allowRepresentative: boolean
  fields: Field[]
  values: Record<string, string>
  signerName: string
  signerRelationship: string
  signedDate: string | null
  voidReason: string | null
}

type HistoryItem = { id: string; label: string; when: string; by: string; recipients: string[]; reason: string | null }

const WcFormEditor = ({
  canManage,
  form,
  staff,
  history
}: {
  canManage: boolean
  form: FormView
  staff: Array<{ id: string; name: string; email: string }>
  history: HistoryItem[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Record<string, string>>(form.values)
  const [signerName, setSignerName] = useState(form.signerName || (form.formKey === 'injury_guidelines_ack' ? form.values.employee_name || '' : form.values.patient_name || ''))
  const [relationship, setRelationship] = useState(form.signerRelationship || (form.allowRepresentative ? 'Self' : ''))
  const [signature, setSignature] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [chosenStaff, setChosenStaff] = useState<string[]>([])
  const [staffFilter, setStaffFilter] = useState('')
  const [outside, setOutside] = useState('')
  const [note, setNote] = useState('')

  const editable = canManage && form.status === 'draft'
  const pdfUrl = `/api/workers-comp/forms/${form.id}/pdf`

  const run = (action: () => Promise<{ error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      after?.()
      router.refresh()
    })

  const filteredStaff = useMemo(() => {
    const q = staffFilter.trim().toLowerCase()

    return q ? staff.filter(item => item.name.toLowerCase().includes(q) || item.email.toLowerCase().includes(q)) : staff
  }, [staff, staffFilter])

  return (
    <div className='flex flex-col gap-6'>
      <Card data-testid='wc-form-editor'>
        <CardHeader>
          <CardTitle className='flex flex-wrap items-center gap-2'>
            {form.title}
            <Badge size='sm' variant={form.status === 'signed' ? 'tonalSuccess' : 'secondary'} className='capitalize' data-testid='wc-form-status'>{form.status}</Badge>
          </CardTitle>
          <CardDescription>
            {form.status === 'signed'
              ? `Signed by ${form.signerName}${form.signerRelationship ? ` (${form.signerRelationship})` : ''} on ${form.signedDate}. Signed forms cannot be changed.`
              : form.status === 'voided'
                ? `Voided: ${form.voidReason}`
                : 'Fill in the form, have it signed below, then print or email it.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-5'>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            {form.fields.map(field => (
              <div key={field.key} className={field.kind === 'initials' ? 'md:col-span-2' : ''}>
                <Label htmlFor={`wc-form-${field.key}`}>{field.label}{field.required ? ' *' : ''}</Label>
                <Input
                  id={`wc-form-${field.key}`}
                  className={`mt-2 ${field.kind === 'initials' ? 'max-w-[8rem]' : ''}`}
                  type={field.kind === 'date' ? 'date' : 'text'}
                  maxLength={field.maxLength}
                  value={values[field.key] || ''}
                  disabled={!editable || pending}
                  onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
                />
              </div>
            ))}
          </div>

          {editable ? (
            <div className='flex flex-col gap-4 rounded-lg border p-4' data-testid='wc-form-sign'>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                <div>
                  <Label htmlFor='wc-form-signer-name'>Printed name of {form.signerLabel.toLowerCase()} *</Label>
                  <Input id='wc-form-signer-name' className='mt-2' maxLength={120} value={signerName} disabled={pending} onChange={event => setSignerName(event.target.value)} />
                </div>
                {form.allowRepresentative ? (
                  <div>
                    <Label htmlFor='wc-form-signer-relationship'>Relationship to patient</Label>
                    <Input id='wc-form-signer-relationship' className='mt-2' maxLength={60} value={relationship} disabled={pending} onChange={event => setRelationship(event.target.value)} />
                  </div>
                ) : null}
              </div>
              <SignaturePad label={`Signature of ${form.signerLabel.toLowerCase()}`} onChange={setSignature} disabled={pending} />
              <div className='flex flex-wrap gap-3'>
                <Button
                  disabled={pending || !signature}
                  onClick={() =>
                    run(() => signWcCaseForm({ formId: form.id, rowVersion: form.rowVersion, fields: values, signerName, signerRelationship: relationship, signature: signature || '' }))
                  }
                >
                  {pending ? 'Saving...' : 'Sign Form'}
                </Button>
                <Button
                  variant='outline'
                  disabled={pending}
                  onClick={() => run(() => saveWcCaseFormDraft({ formId: form.id, rowVersion: form.rowVersion, fields: values, signerName, signerRelationship: relationship }))}
                >
                  Save Draft
                </Button>
              </div>
            </div>
          ) : null}

          <div className='flex flex-wrap gap-3'>
            <Button variant='outline' asChild><a href={pdfUrl} target='_blank' rel='noopener'>Print</a></Button>
            <Button variant='outline' asChild><a href={`${pdfUrl}?download=1`}>Download PDF</a></Button>
          </div>
          {form.status === 'draft' ? <p className='text-textSecondary text-xs'>A draft prints without a signature, so it can also be signed on paper.</p> : null}
        </CardContent>
      </Card>

      {canManage && form.status === 'signed' ? (
        <Card data-testid='wc-form-email'>
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>
              Sends the signed form as a PDF attachment. Choose staff from personnel, add outside addresses (up to 10), or both.
              {form.medical ? ' This form contains protected health information; send it only to people who need it.' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div>
              <Label htmlFor='wc-form-staff-filter'>Staff</Label>
              <Input id='wc-form-staff-filter' className='mt-2' placeholder='Search by name or email' value={staffFilter} onChange={event => setStaffFilter(event.target.value)} />
              <div className='mt-2 max-h-56 overflow-y-auto rounded-md border p-2' data-testid='wc-form-staff'>
                {filteredStaff.length ? filteredStaff.map(item => (
                  <label key={item.id} className='flex min-w-0 cursor-pointer items-start gap-3 rounded p-2 hover:bg-black/5'>
                    <input
                      type='checkbox'
                      className='mt-1'
                      aria-label={item.name}
                      checked={chosenStaff.includes(item.id)}
                      disabled={pending}
                      onChange={event => setChosenStaff(current => (event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id)))}
                    />
                    <span className='min-w-0 break-words text-sm'>{item.name} <span className='text-textSecondary'>· {item.email}</span></span>
                  </label>
                )) : <p className='text-textSecondary p-2 text-sm'>No staff with an email address match.</p>}
              </div>
            </div>
            <div>
              <Label htmlFor='wc-form-outside'>Outside addresses</Label>
              <Textarea id='wc-form-outside' className='mt-2' rows={2} placeholder='adjuster@example.com' value={outside} disabled={pending} onChange={event => setOutside(event.target.value)} />
            </div>
            <div>
              <Label htmlFor='wc-form-note'>Note</Label>
              <Textarea id='wc-form-note' className='mt-2' rows={3} maxLength={2000} value={note} disabled={pending} onChange={event => setNote(event.target.value)} />
            </div>
            <div>
              <Button
                disabled={pending || (!chosenStaff.length && !outside.trim())}
                onClick={() =>
                  run(
                    () => emailWcCaseForm({ formId: form.id, personnelIds: chosenStaff, outsideAddresses: outside, note }),
                    () => {
                      setChosenStaff([])
                      setOutside('')
                      setNote('')
                    }
                  )
                }
              >
                {pending ? 'Sending...' : 'Send Email'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canManage && form.status !== 'voided' ? (
        <Card>
          <CardHeader>
            <CardTitle>Void</CardTitle>
            <CardDescription>{form.status === 'signed' ? 'Signed forms cannot be edited. To correct one, void it with a reason and start a new form.' : 'Discard this draft.'}</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <Label htmlFor='wc-form-void-reason'>Reason</Label>
            <Input id='wc-form-void-reason' maxLength={500} value={voidReason} disabled={pending} onChange={event => setVoidReason(event.target.value)} />
            <div>
              <Button
                variant='outline'
                disabled={pending || voidReason.trim().length < 3}
                onClick={() => window.confirm('Void this form? This cannot be undone.') && run(() => voidWcCaseForm({ formId: form.id, rowVersion: form.rowVersion, reason: voidReason }))}
              >
                Void Form
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid='wc-form-history'>
        <CardHeader>
          <CardTitle>Form History</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          {history.length ? history.map(item => (
            <div key={item.id} className='rounded-lg border p-3 text-sm'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <span className='font-medium'>{item.label}</span>
                <span className='text-textSecondary text-xs'>{new Date(item.when).toLocaleString()} · {item.by}</span>
              </div>
              {item.recipients.length ? <div className='text-textSecondary mt-1 break-words'>To: {item.recipients.join(', ')}</div> : null}
              {item.reason ? <div className='text-textSecondary mt-1 break-words'>{item.reason}</div> : null}
            </div>
          )) : <p className='text-textSecondary text-sm'>No history yet.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

export default WcFormEditor
