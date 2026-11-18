import { redirect } from 'next/navigation'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

/**
 * Alias route: /jsas/[id]/revisions/[versionId] → /jsas/[versionId]
 * Loads the specific revision JSA by its version id.
 */
const JsaRevisionAliasPage = async ({
  params
}: {
  params: Promise<{ id: string; versionId: string }>
}) => {
  await requireTenantPermission('jsa_jha.view')
  const { versionId } = await params
  redirect('/jsas/' + versionId)
}

export default JsaRevisionAliasPage
