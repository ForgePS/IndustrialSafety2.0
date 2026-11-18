import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { runFormCatalogImport } from '@/lib/forgeFormImport'
import { MAX_FORM_IMPORT_BYTES } from '@/lib/forgeFormImportRules'
import { getTenantContext } from '@/lib/forgeTenantContext'

/**
 * Port slice 9: runs the Forge 1.0 form catalog import (forms.manage). A route handler rather than a server
 * action because catalogs with signatures run to many megabytes and server actions accept 1 MB.
 * Body: multipart form with `file` (JSON, at most 20 MB) and `dryRun` ('1' or '0').
 */

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

// Cookie-authenticated POST: accept only same-origin requests (server actions get this check from Next).
const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin')

  if (!origin) return false

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')

  try {
    return Boolean(host) && new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('Not allowed.', 403)

  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return fail('Sign in required.', 401)

  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })

  if (!access.effective.find(item => item.permissionKey === 'forms.manage')?.allowed) return fail('Not found.', 404)

  const length = Number(request.headers.get('content-length') || 0)

  if (length > MAX_FORM_IMPORT_BYTES + 64 * 1024) return fail('The file is larger than 20 MB.', 413)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const dryRun = String(form?.get('dryRun') ?? '1') !== '0'

  if (!file || typeof file === 'string') return fail('Choose a JSON file exported from Forge 1.0.', 400)
  if (file.size > MAX_FORM_IMPORT_BYTES) return fail('The file is larger than 20 MB.', 413)

  let payload: unknown

  try {
    payload = JSON.parse(await file.text())
  } catch {
    return fail('The file is not valid JSON.', 400)
  }

  try {
    const summary = await runFormCatalogImport({ organizationId, userId: context.user.id, payload, dryRun })

    if (!dryRun) {
      revalidatePath('/forms')
      revalidatePath('/forms/submissions')
    }

    return NextResponse.json(summary)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The import failed.', 500)
  }
}
