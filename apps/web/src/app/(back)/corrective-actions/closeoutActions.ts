'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { issueCloseoutToken, revokeCloseoutToken } from '@/lib/forgeCapaCloseout'
import { correctiveActionWithinScope } from '@/lib/forgeCorrectiveActions'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { error?: string; message?: string; path?: string; expiresAt?: string }

/** Closeout links are managed by people who may edit the CAPA, within their edit scope. */
const authorize = async (correctiveActionId: string) => {
  const context = await requireTenantPermission('corrective_actions.edit')
  const organizationId = context.activeOrganization.id

  const { data: capa } = await (createServiceRoleClient() as any)
    .from('forge_corrective_actions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', correctiveActionId)
    .maybeSingle()

  if (!capa) return { error: 'Corrective Action not found.' as const }

  const allowed = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: capa
  })

  if (!allowed) return { error: 'This Corrective Action is outside your edit scope.' as const }

  return { context, organizationId, capa }
}

/** Creates a closeout link (revoking any earlier unused one). The link is returned once. */
export const generateCloseoutLink = async (correctiveActionId: string): Promise<Result> => {
  const auth = await authorize(correctiveActionId)

  if ('error' in auth) return { error: auth.error }

  const issued = await issueCloseoutToken({ organizationId: auth.organizationId, capa: auth.capa, actorUserId: auth.context.user.id })

  if ('error' in issued) return { error: issued.error }

  revalidatePath('/corrective-actions/' + correctiveActionId)

  return {
    path: '/closeout/' + issued.token,
    expiresAt: issued.expiresAt,
    message: 'Closeout link created. Copy it now: it is shown only once.'
  }
}

export const revokeCloseoutLink = async (correctiveActionId: string): Promise<Result> => {
  const auth = await authorize(correctiveActionId)

  if ('error' in auth) return { error: auth.error }

  const revoked = await revokeCloseoutToken({ organizationId: auth.organizationId, correctiveActionId, actorUserId: auth.context.user.id })

  if (revoked.error) return { error: revoked.error }

  revalidatePath('/corrective-actions/' + correctiveActionId)

  return { message: 'Closeout link revoked.' }
}
