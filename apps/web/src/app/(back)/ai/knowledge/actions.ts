'use server'

import { revalidatePath } from 'next/cache'
import { createHash } from 'crypto'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { indexForgeAiKnowledgeSource } from '@/lib/forgeAiKnowledge'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const sourceSchema = z.object({
  sourceId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  sourceType: z.enum(['policy','sop','manual','training_material','document','url','other']),
  sensitivity: z.enum(['public','internal','restricted']),
  sourceReference: z.string().trim().max(2000).optional(),
  contentText: z.string().trim().min(1).max(500000)
})

const hashText = (value: string) =>
  createHash('sha256').update(value.replace(/\r\n/g, '\n').trim()).digest('hex')

export const saveForgeAiKnowledgeSource = async (
  input: z.infer<typeof sourceSchema>
) => {
  const context = await requireTenantPermission('forge_ai.manage_knowledge')
  const parsed = sourceSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid knowledge source.' }
  }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const data = parsed.data

  let before: any = null

  if (data.sourceId) {
    const { data: existing } = await supabase
      .from('forge_ai_knowledge_sources')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', data.sourceId)
      .maybeSingle()

    if (!existing) return { error: 'Knowledge source not found.' }
    before = existing
  }

  const contentHash = hashText(data.contentText)
  const contentChanged = !before || before.content_hash !== contentHash

  const payload = {
    organization_id: organizationId,
    source_type: data.sourceType,
    title: data.title,
    description: data.description || null,
    sensitivity: data.sensitivity,
    source_reference: data.sourceReference || null,
    content_text: data.contentText,
    content_hash: contentChanged ? null : before?.content_hash || contentHash,
    status: contentChanged ? 'draft' : before?.status || 'draft',
    index_error: contentChanged ? null : before?.index_error || null,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { data: saved, error } = data.sourceId
    ? await supabase
        .from('forge_ai_knowledge_sources')
        .update(payload)
        .eq('id', data.sourceId)
        .select('*')
        .single()
    : await supabase
        .from('forge_ai_knowledge_sources')
        .insert({
          ...payload,
          created_by: context.user.id
        })
        .select('*')
        .single()

  if (error || !saved) {
    return { error: error?.message || 'Unable to save knowledge source.' }
  }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: data.sourceId ? 'forge_ai.knowledge_source_updated' : 'forge_ai.knowledge_source_created',
    entity_type: 'forge_ai_knowledge_source',
    entity_id: saved.id,
    before_value: before
      ? {
          title: before.title,
          source_type: before.source_type,
          sensitivity: before.sensitivity,
          status: before.status
        }
      : null,
    after_value: {
      title: saved.title,
      source_type: saved.source_type,
      sensitivity: saved.sensitivity,
      status: saved.status
    }
  })

  revalidatePath('/ai/knowledge')
  return {
    id: saved.id,
    message: contentChanged
      ? 'Knowledge source saved. Reindex it to make the new content searchable.'
      : 'Knowledge source saved.'
  }
}

export const indexKnowledgeSource = async (sourceId: string) => {
  const context = await requireTenantPermission('forge_ai.manage_knowledge')

  try {
    const result = await indexForgeAiKnowledgeSource({
      organizationId: context.activeOrganization.id,
      sourceId,
      actorUserId: context.user.id
    })

    revalidatePath('/ai/knowledge')

    return {
      message:
        'Knowledge indexed successfully: ' +
        String(result.chunkCount) +
        ' semantic chunk(s).'
    }
  } catch (error) {
    revalidatePath('/ai/knowledge')
    return {
      error: error instanceof Error ? error.message : 'Knowledge indexing failed.'
    }
  }
}

export const archiveForgeAiKnowledgeSource = async (sourceId: string) => {
  const context = await requireTenantPermission('forge_ai.manage_knowledge')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_ai_knowledge_sources')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', sourceId)
    .maybeSingle()

  if (!before) return { error: 'Knowledge source not found.' }

  const { error } = await supabase
    .from('forge_ai_knowledge_sources')
    .update({
      status: 'archived',
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', sourceId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'forge_ai.knowledge_source_archived',
    entity_type: 'forge_ai_knowledge_source',
    entity_id: sourceId,
    before_value: {
      title: before.title,
      status: before.status
    },
    after_value: {
      title: before.title,
      status: 'archived'
    }
  })

  revalidatePath('/ai/knowledge')
  return { message: 'Knowledge source archived.' }
}
