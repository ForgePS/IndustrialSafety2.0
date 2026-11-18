import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { csvResponse } from '@/lib/forgeCsv'
import { documentAccessFor, documentAudience, loadDocument, type DocumentContext } from '@/lib/forgeDocumentAccess'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ error: 'Document not found.' }, { status: 404 })

/**
 * Port slice 12: who has and hasn't acknowledged a document's current version. One row per person the document
 * is distributed to (documents.view holders it reaches), with yes / no and the date. Needs
 * documents.view_acknowledgments with the document in scope.
 */
export const GET = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = (await tenantPermissionOrNull('documents.view_acknowledgments')) as DocumentContext | null

  if (!context) return NextResponse.json({ error: 'You do not have permission to export acknowledgments.' }, { status: 403 })

  const { id } = await params
  const organizationId = context.activeOrganization.id
  const doc = await loadDocument(organizationId, id)
  const access = doc ? await documentAccessFor(context, doc) : null

  if (!doc || !access?.viewAcknowledgments) return notFound()

  const supabase = createServiceRoleClient() as any

  const [audience, { data: version }, { data: acks }] = await Promise.all([
    documentAudience(organizationId, doc.id),
    doc.current_version_id
      ? supabase.from('forge_document_versions').select('version_number, effective_on').eq('organization_id', organizationId).eq('id', doc.current_version_id).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.current_version_id
      ? supabase.from('forge_document_acknowledgments').select('user_id, acknowledged_at').eq('organization_id', organizationId).eq('version_id', doc.current_version_id)
      : Promise.resolve({ data: [] })
  ])

  const acknowledgedAt = new Map<string, string>(((acks || []) as any[]).map(row => [row.user_id, row.acknowledged_at]))

  const rows = audience.map(person => {
    const at = acknowledgedAt.get(person.userId)

    return [person.name, person.email || '', version ? `Version ${version.version_number}` : 'No published version', at ? 'Yes' : 'No', at ? at.slice(0, 10) : '']
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'document.acknowledgments_exported',
    entityType: 'forge_document',
    entityId: doc.id,
    afterValue: { rows: rows.length, version_id: doc.current_version_id }
  })

  return csvResponse(`${doc.document_number}-acknowledgments.csv`, ['Name', 'Email', 'Version', 'Acknowledged', 'Acknowledged on'], rows)
}
