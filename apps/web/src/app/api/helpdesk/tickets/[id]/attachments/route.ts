import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { callHelpdeskRpc, getRequestMeta, isUuid } from '@/lib/forgeHelpdeskAccess'
import { HELPDESK_BUCKET, validateAttachment } from '@/lib/forgeHelpdeskAttachments'
import { getHelpdeskSettings } from '@/lib/forgeHelpdeskData'
import { isSameOrigin, jsonError, resolveTicketActor } from '@/lib/forgeHelpdeskHttp'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonError('Invalid request origin.', 403)
  const settings = await getHelpdeskSettings()
  const maxBytes = Math.max(settings.attachment_max_mb, settings.video_max_mb) * 1024 * 1024

  if (Number(request.headers.get('content-length') || 0) > maxBytes + 512 * 1024) return jsonError('File is too large.', 413)

  const { id } = await params
  const actor = await resolveTicketActor(id, { customerPermission: 'helpdesk.ticket.comment' })

  if (!actor) return jsonError('Ticket not found.', 404)

  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File)) return jsonError('Choose a file to attach.', 400)
  const visibility = actor.kind === 'staff' && form.get('visibility') === 'internal' ? 'internal' : 'public'
  const messageId = form.get('messageId')
  const validated = await validateAttachment(file, { attachmentMaxMb: settings.attachment_max_mb, videoMaxMb: settings.video_max_mb })

  if (!validated.ok) return jsonError(validated.error, 400)

  const db = createServiceRoleClient() as any

  if (isUuid(messageId)) {
    const { data: message } = await db.from('forge_support_messages').select('id').eq('id', messageId).eq('ticket_id', actor.ticket.id).maybeSingle()

    if (!message) return jsonError('Message not found.', 400)
  }

  const attachmentId = crypto.randomUUID()
  const storagePath = `${actor.ticket.organization_id}/${actor.ticket.id}/${attachmentId}`
  const { value } = validated
  const { error: uploadError } = await db.storage.from(HELPDESK_BUCKET).upload(storagePath, value.bytes, { contentType: value.mime, upsert: false })

  if (uploadError) {
    console.error('[helpdesk] attachment upload', uploadError.message)

    return jsonError('Unable to upload the file.', 500)
  }

  const userId = actor.kind === 'staff' ? actor.staff.user.id : actor.customer.user.id

  const result = await callHelpdeskRpc('forge_support_record_attachment', {
    p_ticket_id: actor.ticket.id,
    p_actor_user_id: userId,
    p_actor_type: actor.kind,
    p_organization_id: actor.kind === 'customer' ? actor.customer.organizationId : null,
    p_attachment: {
      id: attachmentId,
      storage_path: storagePath,
      file_name: value.fileName,
      original_file_name: value.originalFileName,
      mime_type: value.mime,
      byte_size: value.size,
      sha256: value.sha256,
      scan_status: value.scan.status,
      scan_provider: value.scan.provider,
      scan_detail: value.scan.detail,
      visibility,
      message_id: isUuid(messageId) ? messageId : null
    },
    p_meta: await getRequestMeta()
  })

  if (!result.ok) {
    await db.storage.from(HELPDESK_BUCKET).remove([storagePath])

    return jsonError(result.error || 'Unable to save the attachment.', 400)
  }

  return NextResponse.json({ ok: true, id: attachmentId, fileName: value.fileName, mimeType: value.mime, byteSize: value.size, visibility })
}
