import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { formSubmissionWithinScope } from '@/lib/forgeFormAccess'
import { allowedPermission } from '@/lib/forgeFormSubmissions'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { storage } from '@/lib/platform/storage'

/** Port slice 9: shows a form photo to someone who can see the submission (or who uploaded it to an unsaved form). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 })

export async function GET(_request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  if (!UUID.test(photoId)) return notFound()

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: photo } = await supabase
    .from('forge_record_evidence')
    .select('id, resource_id, storage_path, uploaded_by')
    .eq('organization_id', organizationId)
    .eq('resource_type', 'form_submission')
    .eq('id', photoId)
    .is('archived_at', null)
    .maybeSingle()

  if (!photo) return notFound()

  const { data: submission } = await supabase
    .from('forge_form_submissions')
    .select('id, organization_id, created_by, submitted_by, subject_personnel_id, location_id, division_id')
    .eq('organization_id', organizationId)
    .eq('id', photo.resource_id)
    .maybeSingle()

  if (submission) {
    const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })
    const view = allowedPermission(access, 'forms.view')

    if (!view || !(await formSubmissionWithinScope({ organizationId, userId: context.user.id, scope: view.scope ?? null, submission }))) return notFound()
  } else if (photo.uploaded_by !== context.user.id) {
    return notFound()
  }

  const { url } = await storage().createSignedUrl('forge-evidence', photo.storage_path, 300)

  if (!url) return notFound()

  return NextResponse.redirect(url)
}
