import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { documentAccessFor, loadDocument, VERSION_COLUMNS } from '@/lib/forgeDocumentAccess'
import { canDownloadVersion } from '@/lib/forgeDocumentLibrary'
import { documentsContextOrNull } from '@/lib/forgeDocumentLibraryServer'
import { storage } from '@/lib/platform/storage'

/**
 * Port slice 12: open a document version through a short-lived signed link. Managers, approvers and
 * acknowledgment viewers in scope may open any version; view-only users only the current approved version of a
 * published document distributed to them. ?download=1 saves the file instead of showing it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params
  const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const context = await documentsContextOrNull()

  if (!context || !/^[0-9a-f-]{36}$/i.test(versionId)) return notFound()

  const organizationId = context.activeOrganization.id
  const doc = await loadDocument(organizationId, id)
  const access = doc ? await documentAccessFor(context, doc) : null

  if (!doc || !access) return notFound()

  const { data: version } = await (createServiceRoleClient() as any)
    .from('forge_document_versions')
    .select(VERSION_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('document_id', doc.id)
    .eq('id', versionId)
    .maybeSingle()

  if (!version || !canDownloadVersion(access, doc, version)) return notFound()

  const download = new URL(request.url).searchParams.get('download') === '1'
  const { url } = await storage().createSignedUrl('forge-documents', version.storage_path, 300, download ? { downloadAs: version.file_name } : {})

  if (!url) return NextResponse.json({ error: 'Unable to open the file.' }, { status: 500 })

  return NextResponse.redirect(url)
}
