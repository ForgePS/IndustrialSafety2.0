'use client'

import { useState, useTransition } from 'react'

import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { saveCertificateSettings } from './actions'
import type { CertificateSettings } from './actions'

const CertificateSettingsForm = ({ initial }: { initial: CertificateSettings }) => {
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)

  const field = (key: keyof CertificateSettings, label: string) => (
    <div>
      <Label htmlFor={`certificate-${key}`}>{label}</Label>
      <Input id={`certificate-${key}`} className='mt-2' value={String(values[key] ?? '')} disabled={pending} onChange={event => setValues({ ...values, [key]: event.target.value })} />
    </div>
  )

  return (
    <Card>
      <CardContent className='grid gap-5 p-5 md:grid-cols-2'>
        {field('certificate_title', 'Certificate title')}
        {field('footer_text', 'Footer text')}
        {field('signer_name', 'Signed by')}
        {field('signer_title', 'Signer title')}
        <div className='md:col-span-2'>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveCertificateSettings(values)

                if (result.error) toast('error', result.error)
                else toast('success', result.message || 'Saved.')
              })
            }
          >
            Save Certificate Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default CertificateSettingsForm
