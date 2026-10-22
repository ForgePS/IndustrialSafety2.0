import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'

import CertificateSettingsForm from './CertificateSettingsForm'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Certificate Settings' }

const TrainingSettingsPage = async () => {
  const context = await requireTenantPermission('training.issue_certificate')
  const supabase = createServiceRoleClient() as any
  const { data: settings } = await supabase.from('forge_training_settings').select('*').eq('organization_id', context.activeOrganization.id).maybeSingle()

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Certificates</h1>
          <p className='text-textSecondary mt-2'>Every passed course gets a numbered certificate. These details appear on all of them.</p>
        </div>
        <Button variant='tonalDefault' asChild><Link href='/training'>Back to Training</Link></Button>
      </div>

      <CertificateSettingsForm
        initial={{
          certificate_title: settings?.certificate_title || 'Certificate of Completion',
          signer_name: settings?.signer_name || '',
          signer_title: settings?.signer_title || '',
          footer_text: settings?.footer_text || ''
        }}
      />
    </div>
  )
}

export default TrainingSettingsPage
