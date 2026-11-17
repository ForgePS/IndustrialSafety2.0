'use client'

import { useState } from 'react'

import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'

import SignaturePad from '@/components/common/SignaturePad'

const SignLinkForm = ({
  token,
  fieldLabel,
  defaultName,
  nameLocked
}: {
  token: string
  fieldLabel: string
  defaultName: string
  nameLocked: boolean
}) => {
  const [name, setName] = useState(defaultName)
  const [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!name.trim()) return setError('Enter your name.')
    if (!image) return setError('Draw your signature first.')

    setBusy(true)
    setError(null)

    try {
      const response = await fetch('/api/forms/sign/' + encodeURIComponent(token), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), image })
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) setError(result.error || 'Unable to save your signature. Try again.')
      else setDone(result.status === 'submitted' ? 'Signed. Thank you. Every signature is in and the form is submitted.' : 'Signed. Thank you.')
    } catch {
      setError('Unable to save your signature. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className='rounded-lg border border-green-600/40 bg-green-600/10 p-4' role='status' data-testid='sign-done'>
        {done}
      </div>
    )
  }

  return (
    <form className='flex flex-col gap-4' onSubmit={submit} data-testid='sign-form'>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='sign-name'>Your name</Label>
        <Input
          id='sign-name'
          value={name}
          maxLength={200}
          autoComplete='name'
          readOnly={nameLocked}
          required
          onChange={event => setName(event.target.value)}
        />
      </div>
      <SignaturePad label={fieldLabel} onChange={setImage} disabled={busy} />
      {error ? (
        <div className='text-destructive text-sm' role='alert'>
          {error}
        </div>
      ) : null}
      <Button type='submit' disabled={busy || !image || !name.trim()} data-testid='sign-submit'>
        {busy ? 'Saving…' : 'Sign'}
      </Button>
    </form>
  )
}

export default SignLinkForm
