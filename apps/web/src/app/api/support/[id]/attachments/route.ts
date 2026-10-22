import { jsonError } from '@/lib/forgeHelpdeskHttp'

export async function POST() {
  return jsonError('This endpoint was replaced by /api/helpdesk/tickets/{id}/attachments.', 410)
}
