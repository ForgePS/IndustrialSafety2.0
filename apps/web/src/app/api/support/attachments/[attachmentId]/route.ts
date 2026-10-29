import { NextResponse } from 'next/server'

import { isUuid } from '@/lib/forgeHelpdeskAccess'
import { jsonError } from '@/lib/forgeHelpdeskHttp'

// Legacy download links resolve through the Help Desk attachment route, which enforces current access rules.
export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params

  if (!isUuid(attachmentId)) return jsonError('Attachment not found.', 404)

  return NextResponse.redirect(new URL(`${process.env.BASEPATH || ''}/api/helpdesk/attachments/${attachmentId}`, request.url), 308)
}
