import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'

import WcFormEditor from './WcFormEditor'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getWcCaseForm, loadWcCaseForViewer, wcFormAccess, wcFormSignedDate } from '@/lib/forgeWcForms'
import { WC_FORM_DEFINITIONS } from '@/lib/forgeWcFormsRules'
import type { WcFormKey } from '@/lib/forgeWcFormsRules'

export const metadata: Metadata = { title: 'Workers\' Comp Form' }

const EVENT_LABELS: Record<string, string> = {
  created: 'Started',
  updated: 'Draft saved',
  signed: 'Signed',
  voided: 'Voided',
  printed: 'Opened for printing',
  downloaded: 'Downloaded',
  emailed: 'Emailed',
  email_failed: 'Email failed'
}

const WcFormPage = async ({ params }: { params: Promise<{ id: string; formId: string }> }) => {
  const context = await requireTenantPermission('workers_comp.view')
  const { id, formId } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const form = await getWcCaseForm(organizationId, formId)

  if (!form || form.case_id !== id) notFound()

  const record = await loadWcCaseForViewer(context, id)

  if (!record) notFound()

  const access = await wcFormAccess(context, record)
  const formKey = form.form_key as WcFormKey

  if (!access.canView(formKey)) notFound()

  const definition = WC_FORM_DEFINITIONS[formKey]
  const canManage = access.canManage(formKey)

  const [{ data: events }, { data: staff }] = await Promise.all([
    supabase
      .from('forge_wc_case_form_events')
      .select('id, event_type, actor_user_id, detail, created_at')
      .eq('organization_id', organizationId)
      .eq('case_form_id', formId)
      .order('created_at', { ascending: false })
      .limit(100),
    canManage && form.status === 'signed'
      ? supabase
          .from('forge_personnel')
          .select('id, first_name, last_name, email')
          .eq('organization_id', organizationId)
          .not('email', 'is', null)
          .neq('employment_status', 'terminated')
          .order('last_name')
          .limit(500)
      : Promise.resolve({ data: [] })
  ])

  const actorIds = [...new Set((events || []).map((item: any) => item.actor_user_id).filter(Boolean))]
  const { data: actors } = actorIds.length ? await supabase.from('users').select('user_id, name, email').in('user_id', actorIds) : { data: [] }

  const actorName = (userId: string | null) => {
    const actor = (actors || []).find((row: any) => row.user_id === userId)

    return actor ? actor.name || actor.email : 'System'
  }

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div className='min-w-0'>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} / Workers&apos; Comp / {record.case_number}
          </p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{definition.title}</h1>
          <p className='text-textSecondary mt-1'>{record.employee_name}</p>
        </div>
        <Button variant='tonalDefault' asChild><Link href={`/workers-comp/${id}`}>Back to Case</Link></Button>
      </div>

      <WcFormEditor

        // Remount after a status change so the editor shows the signed or voided view fresh.
        key={`${form.id}-${form.status}`}
        canManage={canManage}
        form={{
          id: form.id,
          rowVersion: form.row_version,
          status: form.status,
          formKey,
          title: definition.title,
          medical: definition.medical,
          signerLabel: definition.signerLabel,
          allowRepresentative: definition.allowRepresentative,
          fields: definition.fields,
          values: form.field_data || {},
          signerName: form.signer_name || '',
          signerRelationship: form.signer_relationship || '',
          signedDate: wcFormSignedDate(form.signed_at),
          voidReason: form.void_reason
        }}
        staff={(staff || []).map((row: any) => ({ id: row.id, name: `${row.first_name} ${row.last_name}`.trim(), email: row.email }))}
        history={(events || []).map((item: any) => ({
          id: String(item.id),
          label: EVENT_LABELS[item.event_type] || item.event_type,
          when: item.created_at,
          by: actorName(item.actor_user_id),
          recipients: Array.isArray(item.detail?.recipients) ? item.detail.recipients.map((entry: any) => (typeof entry === 'string' ? entry : `${entry.to}${entry.ok === false ? ' (failed)' : ''}`)) : [],
          reason: typeof item.detail?.reason === 'string' ? item.detail.reason : null
        }))}
      />
    </div>
  )
}

export default WcFormPage
