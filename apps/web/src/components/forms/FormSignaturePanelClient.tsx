'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbCopy, TbLink, TbLinkOff, TbSignature } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import SignaturePad from '@/components/common/SignaturePad'
import type { EligibleSigner, SignaturePanelData, SignaturePanelField } from '@/lib/forgeFormSigning'
import {
  clearFormSignatureAction,
  issueSignRequestAction,
  listEligibleSignersAction,
  revokeSignRequestAction,
  signFormFieldAction
} from '@/app/(back)/forms/signingActions'

const day = (value: string) => (value ? new Date(value).toLocaleDateString() : '')
const when = (value: string) => (value ? new Date(value).toLocaleString() : '')

const METHOD_LABELS: Record<string, string> = { in_app: 'in the app', remote_link: 'through a sign link', imported: 'imported' }

const SignatureFieldRow = ({ submissionId, field, viewerName }: { submissionId: string; field: SignaturePanelField; viewerName: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [signers, setSigners] = useState<EligibleSigner[] | null>(null)
  const [signerKey, setSignerKey] = useState('')
  const [created, setCreated] = useState<{ url: string; expiresAt: string; message: string } | null>(null)

  const run = (work: () => Promise<void>) =>
    startTransition(async () => {
      setError(null)

      try {
        await work()
      } catch {
        setError('Something went wrong. Try again.')
      }
    })

  const sign = () =>
    run(async () => {
      if (!image) return setError('Draw your signature first.')

      const result = await signFormFieldAction(submissionId, field.id, image)

      if (result.error) return setError(result.error)

      toast('success', result.message || 'Signed.')
      setSigning(false)
      setImage(null)
      router.refresh()
    })

  const clear = () =>
    run(async () => {
      if (!window.confirm(`Clear the signature on "${field.label}"? It will need to be signed again.`)) return

      const result = await clearFormSignatureAction(submissionId, field.id)

      if (result.error) return setError(result.error)

      toast('success', result.message || 'Signature cleared.')
      router.refresh()
    })

  const openRequest = () =>
    run(async () => {
      setRequesting(true)
      setCreated(null)

      const result = await listEligibleSignersAction(submissionId, field.id)

      if (result.error) return setError(result.error)

      setSigners(result.signers || [])
      setSignerKey(result.signers?.[0]?.key || '')
    })

  const sendRequest = () =>
    run(async () => {
      if (!signerKey) return setError('Choose who should sign.')

      const result = await issueSignRequestAction(submissionId, field.id, signerKey)

      if (result.error || !result.path) return setError(result.error || 'Unable to create the signature link.')

      const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '')

      setCreated({ url: base + result.path, expiresAt: result.expiresAt || '', message: result.message || '' })
      setRequesting(false)
      router.refresh()
    })

  const revoke = (requestId: string) =>
    run(async () => {
      const result = await revokeSignRequestAction(submissionId, requestId)

      if (result.error) return setError(result.error)

      toast('success', result.message || 'Signature link cancelled.')
      router.refresh()
    })

  return (
    <li className='flex flex-col gap-3 rounded-lg border p-4' data-testid='signature-field' data-field-id={field.id} data-signed={field.signed ? 'true' : 'false'}>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex flex-col gap-1'>
          <div className='font-medium'>{field.label}</div>
          <div className='text-textSecondary text-xs'>{field.signatory === 'ehs_director' ? 'EHS Director signature' : 'Supervisor signature'}</div>
        </div>
        {field.signed ? (
          <div className='text-right text-sm' data-testid='signature-status'>
            Signed by <span className='font-medium'>{field.signed.name}</span>
            <div className='text-textSecondary text-xs'>
              {when(field.signed.at)}
              {METHOD_LABELS[field.signed.method] ? ` · ${METHOD_LABELS[field.signed.method]}` : ''}
            </div>
          </div>
        ) : (
          <div className='text-sm text-amber-700 dark:text-amber-400' data-testid='signature-status'>
            {field.waitingFor}
          </div>
        )}
      </div>

      {field.signed?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={field.signed.image} alt={`Signature of ${field.signed.name}`} className='h-16 w-auto self-start rounded border bg-white p-1' />
      ) : null}

      {field.openRequests.length ? (
        <ul className='flex flex-col gap-2' data-testid='open-sign-requests'>
          {field.openRequests.map(request => (
            <li key={request.id} className='flex flex-wrap items-center justify-between gap-2 text-sm'>
              <span>
                Link sent to {request.requestedForName || 'someone'} on {day(request.createdAt)}, expires {day(request.expiresAt)}.
              </span>
              <Button type='button' size='sm' variant='outline' onClick={() => revoke(request.id)} disabled={pending} data-testid='revoke-sign-request'>
                <TbLinkOff />
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {created ? (
        <div className='flex flex-col gap-2' data-testid='sign-link-created'>
          <div className='text-sm font-medium'>{created.message}</div>
          <div className='flex flex-wrap gap-2'>
            <Input readOnly value={created.url} className='min-w-0 flex-1' data-testid='sign-link-url' onFocus={event => event.currentTarget.select()} />
            <Button type='button' variant='outline' onClick={() => navigator.clipboard?.writeText(created.url).then(() => toast('success', 'Link copied.'))}>
              <TbCopy />
              Copy
            </Button>
          </div>
          {created.expiresAt ? <div className='text-textSecondary text-xs'>Expires {day(created.expiresAt)}. It can be used once.</div> : null}
        </div>
      ) : null}

      {signing ? (
        <div className='flex flex-col gap-3' data-testid='sign-in-app'>
          <SignaturePad label={`Signing as ${viewerName}`} onChange={setImage} disabled={pending} />
          <div className='flex flex-wrap gap-2'>
            <Button type='button' onClick={sign} disabled={pending || !image} data-testid='save-signature'>
              {pending ? 'Saving…' : 'Save Signature'}
            </Button>
            <Button type='button' variant='outline' onClick={() => setSigning(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {requesting && signers ? (
        <div className='flex flex-col gap-2' data-testid='sign-request-form'>
          <Label htmlFor={`signer-${field.id}`}>Who should sign?</Label>
          {signers.length ? (
            <select
              id={`signer-${field.id}`}
              className='border-input bg-background h-10 rounded-md border px-3 text-sm'
              value={signerKey}
              onChange={event => setSignerKey(event.target.value)}
              data-testid='signer-select'
            >
              {signers.map(signer => (
                <option key={signer.key} value={signer.key}>
                  {signer.name}
                  {signer.detail ? ` (${signer.detail})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className='text-textSecondary text-sm'>
              {field.signatory === 'ehs_director'
                ? 'No one in the company can sign as EHS Director for this form.'
                : 'No one at this location can sign. Add personnel to the location or give someone permission to edit forms.'}
            </div>
          )}
          <div className='flex flex-wrap gap-2'>
            <Button type='button' onClick={sendRequest} disabled={pending || !signerKey} data-testid='send-sign-request'>
              <TbLink />
              Send Link
            </Button>
            <Button type='button' variant='outline' onClick={() => setRequesting(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className='text-destructive text-sm' role='alert'>
          {error}
        </div>
      ) : null}

      {!signing && !requesting ? (
        <div className='flex flex-wrap gap-2'>
          {field.canSign ? (
            <Button type='button' size='sm' onClick={() => setSigning(true)} disabled={pending} data-testid='sign-field'>
              <TbSignature />
              Sign
            </Button>
          ) : null}
          {field.canRequest ? (
            <Button type='button' size='sm' variant='outline' onClick={openRequest} disabled={pending} data-testid='request-signature'>
              <TbLink />
              Send link to sign
            </Button>
          ) : null}
          {field.canClear ? (
            <Button type='button' size='sm' variant='outline' onClick={clear} disabled={pending} data-testid='clear-signature'>
              Clear Signature
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

const FormSignaturePanelClient = ({ data }: { data: SignaturePanelData }) => (
  <Card data-testid='form-signature-panel'>
    <CardHeader>
      <CardTitle>Signatures</CardTitle>
      <CardDescription>
        Supervisor and EHS Director signatures are given after the form is filled in. Only someone with the Sign as EHS Director
        permission can sign the EHS Director signature. The form is submitted once every signature is in.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ul className='flex flex-col gap-3'>
        {data.fields.map(field => (
          <SignatureFieldRow key={field.id} submissionId={data.submissionId} field={field} viewerName={data.viewerName} />
        ))}
      </ul>
    </CardContent>
  </Card>
)

export default FormSignaturePanelClient
