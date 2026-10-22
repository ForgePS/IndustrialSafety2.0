'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const saveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  prompt: z.string().trim().min(1).max(6000),
  reportType: z.enum(['ai_analysis','executive_summary','incident','training','inspection','asset']),
  visibility: z.enum(['private','tenant']),
  defaultDateRangeDays: z.number().int().min(1).max(3650).nullable(),
  pinned: z.boolean()
})

export const createForgeAiSavedReport = async (
  input: z.infer<typeof saveSchema>
) => {
  const context = await requireTenantPermission('forge_ai.save_reports')
  const parsed = saveSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid saved report.' }
  }

  const supabase = createServiceRoleClient() as any
  const data = parsed.data

  const { data: report, error } = await supabase
    .from('forge_ai_saved_reports')
    .insert({
      organization_id: context.activeOrganization.id,
      owner_user_id: context.user.id,
      name: data.name,
      description: data.description?.trim() || null,
      prompt: data.prompt,
      report_type: data.reportType,
      visibility: data.visibility,
      pinned: data.pinned,
      default_date_range_days: data.defaultDateRangeDays,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !report) {
    return { error: error?.message || 'Unable to save AI report.' }
  }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: context.activeOrganization.id,
    action: 'forge_ai.saved_report_created',
    entity_type: 'forge_ai_saved_report',
    entity_id: report.id,
    after_value: {
      name: report.name,
      report_type: report.report_type,
      visibility: report.visibility,
      default_date_range_days: report.default_date_range_days
    }
  })

  revalidatePath('/ai/analytics')
  return { message: 'AI report saved.' }
}

export const setForgeAiSavedReportPinned = async ({
  reportId,
  pinned
}: {
  reportId: string
  pinned: boolean
}) => {
  const context = await requireTenantPermission('forge_ai.save_reports')
  const supabase = createServiceRoleClient() as any

  const { data: report } = await supabase
    .from('forge_ai_saved_reports')
    .select('*')
    .eq('organization_id', context.activeOrganization.id)
    .eq('owner_user_id', context.user.id)
    .eq('id', reportId)
    .maybeSingle()

  if (!report) return { error: 'Saved report not found.' }

  const { error } = await supabase
    .from('forge_ai_saved_reports')
    .update({
      pinned,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', reportId)

  if (error) return { error: error.message }

  revalidatePath('/ai/analytics')
  return { message: pinned ? 'Report pinned.' : 'Report unpinned.' }
}

export const deleteForgeAiSavedReport = async (reportId: string) => {
  const context = await requireTenantPermission('forge_ai.save_reports')
  const supabase = createServiceRoleClient() as any

  const { data: report } = await supabase
    .from('forge_ai_saved_reports')
    .select('*')
    .eq('organization_id', context.activeOrganization.id)
    .eq('owner_user_id', context.user.id)
    .eq('id', reportId)
    .maybeSingle()

  if (!report) return { error: 'Saved report not found.' }

  const { error } = await supabase
    .from('forge_ai_saved_reports')
    .delete()
    .eq('id', reportId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: context.activeOrganization.id,
    action: 'forge_ai.saved_report_deleted',
    entity_type: 'forge_ai_saved_report',
    entity_id: reportId,
    before_value: {
      name: report.name,
      report_type: report.report_type,
      visibility: report.visibility
    }
  })

  revalidatePath('/ai/analytics')
  return { message: 'Saved report deleted.' }
}
