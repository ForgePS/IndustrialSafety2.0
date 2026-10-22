'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const schema = z.object({
  certificate_title: z.string().trim().min(1, 'Enter the certificate title.').max(120),
  signer_name: z
    .string()
    .max(200)
    .transform(value => value.trim() || null),
  signer_title: z
    .string()
    .max(200)
    .transform(value => value.trim() || null),
  footer_text: z
    .string()
    .max(500)
    .transform(value => value.trim() || null)
})

export type CertificateSettings = z.input<typeof schema>

export const saveCertificateSettings = async (values: CertificateSettings) => {
  const context = await requireTenantPermission('training.issue_certificate')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const parsed = schema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the certificate settings.' }

  const { error } = await supabase
    .from('forge_training_settings')
    .upsert({ organization_id: organizationId, ...parsed.data, updated_by: context.user.id, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' })

  if (error) return { error: error.message }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'training.certificate_settings_updated', entityType: 'training_settings', entityId: organizationId, afterValue: parsed.data })
  revalidatePath('/training/settings')

  return { message: 'Certificate settings saved.' }
}
