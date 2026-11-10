import { createHash } from 'crypto'

import { NextResponse } from 'next/server'

import { createServiceRoleClient } from '@repo/supabase/server'
import { z } from 'zod'

import { recordForgeAiAudit } from '@/lib/forgeAiExecution'
import { KNOWLEDGE_MAX_FILE_BYTES, KnowledgeDocumentError, extractKnowledgeDocument } from '@/lib/forgeAiDocuments'
import { createForgeAiKnowledgeVersion, indexForgeAiKnowledgeSource } from '@/lib/forgeAiKnowledge'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getTenantContext } from '@/lib/forgeTenantContext'

export const dynamic = 'force-dynamic'

const fieldsSchema = z.object({
  sourceId: z.string().uuid().nullable(),
  title: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(2000).nullable(),
  sourceType: z.enum(['policy', 'sop', 'manual', 'training_material', 'document', 'other']),
  sensitivity: z.enum(['public', 'internal', 'restricted']),
  sourceReference: z.string().trim().max(2000).nullable(),
  changeNote: z.string().trim().max(500).nullable(),
  indexNow: z.boolean()
})

const field = (form: FormData, name: string) => {
  const value = form.get(name)

  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// Upload a PDF, Word, Markdown or text file as a new knowledge source, or as a new version of an
// existing one. Text is extracted server-side; the file itself is not stored, only its checksum.
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  let validOrigin = false

  try {
    validOrigin = Boolean(origin && host && new URL(origin).host === host)
  } catch {
    validOrigin = false
  }

  if (!validOrigin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })

  if (Number(request.headers.get('content-length') || 0) > KNOWLEDGE_MAX_FILE_BYTES + 200_000) {
    return NextResponse.json({ error: 'Files must be 10 MB or smaller.' }, { status: 413 })
  }

  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })

  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })
  const allowed = access.effective.some(item => item.permissionKey === 'forge_ai.manage_knowledge' && item.allowed)

  if (!allowed) return NextResponse.json({ error: 'You do not have permission to manage Forge AI knowledge.' }, { status: 403 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!form || !(file instanceof File)) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 })

  const parsed = fieldsSchema.safeParse({
    sourceId: field(form, 'sourceId'),
    title: field(form, 'title'),
    description: field(form, 'description'),
    sourceType: field(form, 'sourceType') || 'document',
    sensitivity: field(form, 'sensitivity') || 'internal',
    sourceReference: field(form, 'sourceReference'),
    changeNote: field(form, 'changeNote'),
    indexNow: field(form, 'indexNow') !== 'false'
  })

  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid upload.' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  let extracted

  try {
    extracted = await extractKnowledgeDocument(bytes, file.name)
  } catch (error) {
    const message = error instanceof KnowledgeDocumentError ? error.message : 'This file could not be read.'

    if (!(error instanceof KnowledgeDocumentError)) console.error('[forge-ai] knowledge extraction failed', error)

    return NextResponse.json({ error: message }, { status: 422 })
  }

  const supabase = createServiceRoleClient() as any
  const data = parsed.data
  let sourceId = data.sourceId

  if (sourceId) {
    const { data: existing } = await supabase
      .from('forge_ai_knowledge_sources')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('id', sourceId)
      .maybeSingle()

    if (!existing) return NextResponse.json({ error: 'Knowledge source not found.' }, { status: 404 })
    if (existing.status === 'archived') return NextResponse.json({ error: 'Archived sources cannot receive new versions.' }, { status: 409 })
  } else {
    const title = data.title || file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200)
    const { data: created, error } = await supabase
      .from('forge_ai_knowledge_sources')
      .insert({
        organization_id: organizationId,
        source_type: data.sourceType,
        title,
        description: data.description,
        sensitivity: data.sensitivity,
        source_reference: data.sourceReference || file.name,
        status: 'draft',
        metadata: { created_from_upload: true },
        created_by: context.user.id,
        updated_by: context.user.id
      })
      .select('id')
      .single()

    if (error || !created) return NextResponse.json({ error: error?.message || 'Unable to create the knowledge source.' }, { status: 500 })
    sourceId = created.id as string
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const version = await createForgeAiKnowledgeVersion({
    organizationId,
    sourceId: sourceId as string,
    actorUserId: context.user.id,
    contentText: extracted.text,
    origin: 'upload',
    file: { name: file.name.slice(0, 255), mime: file.type || null, sizeBytes: bytes.byteLength, sha256, extractor: extracted.kind, pageCount: extracted.pageCount },
    changeNote: data.changeNote
  })

  await recordForgeAiAudit({
    organizationId,
    actorUserId: context.user.id,
    eventType: 'knowledge.uploaded',
    resourceType: 'forge_ai_knowledge_source',
    resourceId: sourceId,
    detail: { file_name: file.name, kind: extracted.kind, size_bytes: bytes.byteLength, sha256, version: version.versionNumber, pages: extracted.pageCount }
  })

  let index: { chunkCount: number; retrievalMode: string } | null = null
  let indexError: string | null = null

  if (data.indexNow) {
    try {
      index = await indexForgeAiKnowledgeSource({ organizationId, sourceId: sourceId as string, actorUserId: context.user.id })
    } catch (error) {
      indexError = error instanceof Error ? error.message : 'Indexing failed.'
    }
  }

  return NextResponse.json({
    sourceId,
    version: version.versionNumber,
    kind: extracted.kind,
    pages: extracted.pageCount,
    characters: extracted.text.length,
    warnings: extracted.warnings,
    index,
    indexError
  })
}
