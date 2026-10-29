'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const slugKey = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

const templateSchema = z.object({
  templateId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  inspectionType: z.string().trim().min(1),
  isActive: z.boolean()
})

const itemSchema = z.object({
  templateId: z.string().uuid(),
  itemId: z.string().uuid().nullable().optional(),
  itemKey: z.string().trim().min(1),
  sectionKey: z.string().trim().min(1),
  sectionLabel: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  guidance: z.string().trim().optional(),
  responseType: z.enum(['pass_fail_na','yes_no_na','text','number']),
  sortOrder: z.number().int(),
  isRequired: z.boolean(),
  findingOn: z.array(z.string())
})

const audit = async ({
  supabase,
  actorUserId,
  organizationId,
  action,
  entityType,
  entityId,
  before,
  after
}: {
  supabase: any
  actorUserId: string
  organizationId: string
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
}) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

export const saveInspectionTemplate = async (input: z.infer<typeof templateSchema>) => {
  const context = await requireTenantPermission('inspections.manage_templates')
  const parsed = templateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid template.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const data = parsed.data

  let before: any = null
  if (data.templateId) {
    const { data: current } = await supabase
      .from('forge_inspection_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', data.templateId)
      .maybeSingle()

    if (!current) return { error: 'Inspection template not found.' }
    before = current
  }

  const payload = {
    organization_id: organizationId,
    template_key: before?.template_key || slugKey(data.name),
    name: data.name,
    description: data.description || null,
    inspection_type: data.inspectionType,
    is_active: data.isActive,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { data: saved, error } = data.templateId
    ? await supabase
        .from('forge_inspection_templates')
        .update(payload)
        .eq('id', data.templateId)
        .select('*')
        .single()
    : await supabase
        .from('forge_inspection_templates')
        .insert({
          ...payload,
          version: 1,
          created_by: context.user.id
        })
        .select('*')
        .single()

  if (error || !saved) return { error: error?.message ?? 'Unable to save inspection template.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: data.templateId ? 'inspection.template_updated' : 'inspection.template_created',
    entityType: 'inspection_template',
    entityId: saved.id,
    before,
    after: saved
  })

  revalidatePath('/inspections/templates')
  revalidatePath('/inspections/create')
  return { id: saved.id, message: data.templateId ? 'Inspection template updated.' : 'Inspection template created.' }
}

export const saveInspectionTemplateItem = async (input: z.infer<typeof itemSchema>) => {
  const context = await requireTenantPermission('inspections.manage_templates')
  const parsed = itemSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid checklist item.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const data = parsed.data

  const { data: template } = await supabase
    .from('forge_inspection_templates')
    .select('id, version')
    .eq('organization_id', organizationId)
    .eq('id', data.templateId)
    .maybeSingle()

  if (!template) return { error: 'Inspection template not found.' }

  let before: any = null
  if (data.itemId) {
    const { data: current } = await supabase
      .from('forge_inspection_template_items')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('template_id', data.templateId)
      .eq('id', data.itemId)
      .maybeSingle()

    if (!current) return { error: 'Checklist item not found.' }
    before = current
  }

  const payload = {
    organization_id: organizationId,
    template_id: data.templateId,
    item_key: slugKey(data.itemKey),
    section_key: slugKey(data.sectionKey),
    section_label: data.sectionLabel,
    prompt: data.prompt,
    guidance: data.guidance || null,
    response_type: data.responseType,
    sort_order: data.sortOrder,
    is_required: data.isRequired,
    finding_on: data.findingOn,
    updated_at: new Date().toISOString()
  }

  const { data: saved, error } = data.itemId
    ? await supabase
        .from('forge_inspection_template_items')
        .update(payload)
        .eq('id', data.itemId)
        .select('*')
        .single()
    : await supabase
        .from('forge_inspection_template_items')
        .insert(payload)
        .select('*')
        .single()

  if (error || !saved) return { error: error?.message ?? 'Unable to save checklist item.' }

  await supabase
    .from('forge_inspection_templates')
    .update({
      version: Number(template.version || 1) + 1,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', data.templateId)

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: data.itemId ? 'inspection.template_item_updated' : 'inspection.template_item_created',
    entityType: 'inspection_template_item',
    entityId: saved.id,
    before,
    after: saved
  })

  revalidatePath('/inspections/templates')
  return { id: saved.id, message: data.itemId ? 'Checklist item updated.' : 'Checklist item added.' }
}

export const deleteInspectionTemplateItem = async ({
  templateId,
  itemId
}: {
  templateId: string
  itemId: string
}) => {
  const context = await requireTenantPermission('inspections.manage_templates')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: before }, { data: template }] = await Promise.all([
    supabase
      .from('forge_inspection_template_items')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('template_id', templateId)
      .eq('id', itemId)
      .maybeSingle(),
    supabase
      .from('forge_inspection_templates')
      .select('id, version')
      .eq('organization_id', organizationId)
      .eq('id', templateId)
      .maybeSingle()
  ])

  if (!before || !template) return { error: 'Checklist item not found.' }

  const { error } = await supabase
    .from('forge_inspection_template_items')
    .delete()
    .eq('id', itemId)

  if (error) return { error: error.message }

  await supabase
    .from('forge_inspection_templates')
    .update({
      version: Number(template.version || 1) + 1,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', templateId)

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.template_item_deleted',
    entityType: 'inspection_template_item',
    entityId: itemId,
    before,
    after: null
  })

  revalidatePath('/inspections/templates')
  return { message: 'Checklist item deleted.' }
}
