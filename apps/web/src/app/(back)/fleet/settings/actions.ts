'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { loadFleetSettings } from '@/lib/forgeFleetAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type FleetSettingsInput = {
  defectOutOfService: boolean
  defectOpensRepair: boolean
  renewalWarningDays: number | string
  dvirRetentionDays: number | string
}

/** Saves the organization's fleet settings (one row per organization). */
export const saveFleetSettings = async (input: FleetSettingsInput): Promise<{ error?: string; errors?: Record<string, string>; message?: string }> => {
  const context = await requireTenantPermission('fleet.settings')
  const organizationId = context.activeOrganization.id
  const warning = Number(input.renewalWarningDays)
  const retention = Number(input.dvirRetentionDays)
  const errors: Record<string, string> = {}

  if (!Number.isInteger(warning) || warning < 1 || warning > 180) errors.renewalWarningDays = 'Choose 1 to 180 days.'
  if (!Number.isInteger(retention) || retention < 91 || retention > 3650) errors.dvirRetentionDays = 'Federal rules require at least 91 days (up to 3650).'
  if (Object.keys(errors).length) return { errors }

  const before = await loadFleetSettings(organizationId)

  const values = {
    organization_id: organizationId,
    defect_out_of_service: Boolean(input.defectOutOfService),
    defect_opens_repair: Boolean(input.defectOpensRepair),
    renewal_warning_days: warning,
    dvir_retention_days: retention,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await (createServiceRoleClient() as any).from('forge_fleet_settings').upsert(values, { onConflict: 'organization_id' })

  if (error) return { error: 'Unable to save fleet settings.' }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'fleet.settings_saved', entityType: 'fleet_settings', entityId: organizationId, beforeValue: before, afterValue: values })
  revalidatePath('/fleet', 'layout')

  return { message: 'Fleet settings saved.' }
}
