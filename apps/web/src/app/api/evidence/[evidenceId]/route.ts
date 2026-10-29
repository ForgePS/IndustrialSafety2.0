import { getAuthUser } from '@repo/supabase/serverHelpers'
import { getEvidenceDownloadUrl } from '@/lib/forgeEvidence'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ evidenceId: string }> }
) {
  const {
    data: { user }
  } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })

  const context = await getTenantContext()
  if (!context.activeOrganization) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const { evidenceId } = await params
  // getEvidenceDownloadUrl re-checks requireForgeResourceView on the parent resource.
  const result = await getEvidenceDownloadUrl({
    organizationId: context.activeOrganization.id,
    evidenceId
  })

  if (result.error || !result.url) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  return NextResponse.redirect(result.url)
}
