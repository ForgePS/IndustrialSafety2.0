import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { isUuid } from '@/lib/forgeHelpdeskAccess'
import { HELPDESK_BUCKET } from '@/lib/forgeHelpdeskAttachments'
import { jsonError, resolveTicketActor } from '@/lib/forgeHelpdeskHttp'
import { storage } from '@/lib/platform/storage'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!isUuid(id)) return jsonError('Attachment not found.', 404)
  const db = createServiceRoleClient() as any

  const { data: attachment } = await db
    .from('forge_support_attachments')
    .select('id,ticket_id,visibility,storage_path,file_name,mime_type,scan_status,deleted_at')
    .eq('id', id)
    .maybeSingle()

  if (!attachment || attachment.deleted_at || attachment.scan_status === 'blocked') return jsonError('Attachment not found.', 404)

  const actor = await resolveTicketActor(attachment.ticket_id, { customerPermission: 'helpdesk.ticket.view_own' })

  if (!actor) return jsonError('Attachment not found.', 404)
  if (actor.kind === 'customer' && attachment.visibility !== 'public') return jsonError('Attachment not found.', 404)

  const inline = new URL(request.url).searchParams.get('inline') === '1' && /^(image\/(png|jpeg|webp|gif)|application\/pdf|video\/(mp4|webm))$/.test(attachment.mime_type)

  const { url, error } = await storage().createSignedUrl(HELPDESK_BUCKET, attachment.storage_path, 60, inline ? {} : { downloadAs: attachment.file_name })

  if (error || !url) return jsonError('Unable to open the attachment.', 500)

  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } })
}
