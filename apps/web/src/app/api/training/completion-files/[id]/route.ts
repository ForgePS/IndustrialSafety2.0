import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { TRAINING_FILES_BUCKET, completionAccess } from '@/lib/forgeTrainingFiles'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { storage } from '@/lib/platform/storage'

/**
 * Opens a training attachment through a 5-minute link. Training View within scope, or the learner's own
 * record. Removed attachments are not served (1.0 served archived ones).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { data: file } = await (createServiceRoleClient() as any)
    .from('forge_training_completion_files')
    .select('completion_id, storage_path')
    .eq('organization_id', context.activeOrganization.id)
    .eq('id', id)
    .is('removed_at', null)
    .maybeSingle()

  if (!file) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const access = await completionAccess({ user: context.user, activeOrganization: context.activeOrganization }, file.completion_id)

  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { url } = await storage().createSignedUrl(TRAINING_FILES_BUCKET, file.storage_path, 300)

  if (!url) return NextResponse.json({ error: 'Unable to open the file.' }, { status: 500 })

  return NextResponse.redirect(url)
}
