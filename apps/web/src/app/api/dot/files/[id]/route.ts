import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { loadCompanyDriverInScope, loadDotRecordInScope, loadDriverFileInScope } from '@/lib/forgeDotServer'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { storage } from '@/lib/platform/storage'

/** Opens an uploaded DOT copy through a short-lived link, after the permission and scope checks. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await tenantPermissionOrNull('dot.view')

  if (!context || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { data: file } = await (createServiceRoleClient() as any)
    .from('forge_dot_files')
    .select('*')
    .eq('organization_id', context.activeOrganization.id)
    .eq('id', id)
    .is('removed_at', null)
    .maybeSingle()

  if (!file) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const loaded = file.driver_file_id
    ? await loadDriverFileInScope(context as any, file.driver_file_id)
    : file.company_driver_id
      ? await loadCompanyDriverInScope(context as any, file.company_driver_id)
      : await loadDotRecordInScope(context as any, file.record_id)

  if (!('ok' in loaded)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { url } = await storage().createSignedUrl('forge-dot', file.storage_path, 300)

  if (!url) return NextResponse.json({ error: 'Unable to open the file.' }, { status: 500 })

  return NextResponse.redirect(url)
}
