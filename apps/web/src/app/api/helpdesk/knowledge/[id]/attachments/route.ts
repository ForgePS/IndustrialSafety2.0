import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getHelpdeskStaffAccess, getRequestMeta, isUuid } from '@/lib/forgeHelpdeskAccess'
import { HELPDESK_BUCKET, validateAttachment } from '@/lib/forgeHelpdeskAttachments'
import { isSameOrigin, jsonError } from '@/lib/forgeHelpdeskHttp'

const KB_TYPES = /^(image\/(png|jpeg|webp|gif)|application\/pdf|video\/(mp4|webm))$/

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonError('Invalid request origin.', 403)
  const staff = await getHelpdeskStaffAccess()

  if (!staff?.has('helpdesk.knowledge.edit')) return jsonError('Access denied.', 403)
  const { id } = await params

  if (!isUuid(id)) return jsonError('Article not found.', 404)
  const db = createServiceRoleClient() as any
  const { data: article } = await db.from('forge_support_knowledge_articles').select('id,status').eq('id', id).maybeSingle()

  if (!article) return jsonError('Article not found.', 404)
  if (article.status === 'archived') return jsonError('Restore the article before adding media.', 409)

  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File)) return jsonError('Choose a file.', 400)
  if (!KB_TYPES.test(file.type)) return jsonError('Help articles accept images, PDFs and short videos.', 400)
  const validated = await validateAttachment(file, { attachmentMaxMb: 10, videoMaxMb: 25 })

  if (!validated.ok) return jsonError(validated.error, 400)

  const attachmentId = crypto.randomUUID()
  const storagePath = `kb/${article.id}/${attachmentId}`
  const { value } = validated
  const { error: uploadError } = await db.storage.from(HELPDESK_BUCKET).upload(storagePath, value.bytes, { contentType: value.mime, upsert: false })

  if (uploadError) return jsonError('Unable to upload the file.', 500)

  const { error } = await db.from('forge_support_knowledge_attachments').insert({
    id: attachmentId,
    article_id: article.id,
    storage_path: storagePath,
    file_name: value.fileName,
    mime_type: value.mime,
    byte_size: value.size,
    uploaded_by: staff.user.id
  })

  if (error) {
    await db.storage.from(HELPDESK_BUCKET).remove([storagePath])

    return jsonError('Unable to save the file.', 500)
  }

  const meta = await getRequestMeta()

  await db.rpc('forge_support_audit', {
    p_actor_user_id: staff.user.id,
    p_actor_type: 'forge_staff',
    p_organization_id: null,
    p_action: 'helpdesk.knowledge.attachment_added',
    p_entity_type: 'support_knowledge_article',
    p_entity_id: article.id,
    p_before: null,
    p_after: { attachment_id: attachmentId, file_name: value.fileName, sha256: value.sha256, scan_status: value.scan.status },
    p_reason: null,
    p_request_id: meta.request_id,
    p_source_ip: meta.source_ip,
    p_user_agent: meta.user_agent
  })

  return NextResponse.json({ ok: true, id: attachmentId, fileName: value.fileName, url: `/api/helpdesk/knowledge/media/${attachmentId}` })
}
