import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getHelpdeskCustomerAccess, getHelpdeskStaffAccess, isUuid } from '@/lib/forgeHelpdeskAccess'
import { HELPDESK_BUCKET } from '@/lib/forgeHelpdeskAttachments'
import { jsonError } from '@/lib/forgeHelpdeskHttp'
import { storage } from '@/lib/platform/storage'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!isUuid(id)) return jsonError('File not found.', 404)
  const db = createServiceRoleClient() as any

  const { data: media } = await db
    .from('forge_support_knowledge_attachments')
    .select('id,storage_path,file_name,mime_type,deleted_at,article:forge_support_knowledge_articles(status,visibility,organization_id)')
    .eq('id', id)
    .maybeSingle()

  if (!media || media.deleted_at || !media.article) return jsonError('File not found.', 404)

  const staff = await getHelpdeskStaffAccess()

  if (!staff?.has('helpdesk.support.view')) {
    const customer = await getHelpdeskCustomerAccess()
    const article = media.article

    const visible =
      customer?.has('helpdesk.knowledge.view') &&
      article.status === 'published' &&
      (article.visibility === 'public_customer' ||
        article.visibility === 'authenticated_users' ||
        (article.visibility === 'tenant_only' && article.organization_id === customer.organizationId))

    if (!visible) return jsonError('File not found.', 404)
  }

  const { url, error } = await storage().createSignedUrl(HELPDESK_BUCKET, media.storage_path, 300)

  if (error || !url) return jsonError('Unable to open the file.', 500)

  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'private, no-store' } })
}
