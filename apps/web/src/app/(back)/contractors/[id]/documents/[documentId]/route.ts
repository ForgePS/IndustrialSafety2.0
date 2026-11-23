import { NextResponse } from 'next/server'

import { CONTRACTOR_BUCKET, contractorRights, loadCompany } from '@/lib/forgeContractors'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { storage } from '@/lib/platform/storage'

/** Port slice 15: opens a company document's file through a short-lived signed link (contractor_safety.view, company scope). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  const context = await tenantPermissionOrNull('contractor_safety.view')
  const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 })

  if (!context) return notFound()

  const organizationId = context.activeOrganization.id as string
  const found = await loadCompany({ organizationId, rights: await contractorRights(organizationId, context.user.id, context.access), id })
  const document = found?.documents.find((item: any) => item.id === documentId)

  if (!document || !document.storage_path) return notFound()

  const { url } = await storage().createSignedUrl(CONTRACTOR_BUCKET, document.storage_path, 300, { downloadAs: document.file_name })

  if (!url) return NextResponse.json({ error: 'Unable to open the file.' }, { status: 500 })

  return NextResponse.redirect(url)
}
