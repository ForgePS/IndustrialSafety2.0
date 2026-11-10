import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { commandCenterAvailable } from '@/lib/forgeFeatureAvailability'

// Whether the header shows the Forge AI assistant for this user, and with what name. Hidden when
// the user lacks forge_ai.use (which includes the tenant not having Forge AI) or the tenant has
// switched the assistant off.
export const getForgeAiHeaderState = async ({ organizationId, userId }: { organizationId: string; userId: string }) => {
  const access = await getEffectiveTenantAccess({ organizationId, userId })

  if (!access.effective.some(item => item.permissionKey === 'forge_ai.use' && item.allowed)) return null

  const { data: settings } = await (createServiceRoleClient() as any)
    .from('forge_ai_tenant_settings')
    .select('enabled, assistant_name')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (settings && settings.enabled === false) return null

  return {
    assistantName: String(settings?.assistant_name || 'Forge AI').slice(0, 40),
    commandCenter: commandCenterAvailable(access.effective)
  }
}
