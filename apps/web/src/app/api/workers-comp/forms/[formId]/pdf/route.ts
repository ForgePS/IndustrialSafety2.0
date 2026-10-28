import { NextResponse } from 'next/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getWcCaseForm, loadWcCaseForViewer, recordWcFormEvent, renderWcCaseFormPdf, wcFormAccess } from '@/lib/forgeWcForms'
import { wcFormFileName } from '@/lib/forgeWcFormsRules'
import type { WcFormKey } from '@/lib/forgeWcFormsRules'

export const dynamic = 'force-dynamic'

/**
 * The filled form drawn on the company's original PDF. `?download=1` saves it; otherwise it opens in the
 * browser for printing. Each request is recorded on the form's history and in the audit log.
 */
export const GET = async (request: Request, { params }: { params: Promise<{ formId: string }> }) => {
  const context = await requireTenantPermission('workers_comp.view')
  const { formId } = await params
  const organizationId = context.activeOrganization.id
  const form = await getWcCaseForm(organizationId, formId)
  const record = form ? await loadWcCaseForViewer(context, form.case_id) : null

  // Missing, out of scope and not permitted all look the same, so a form's existence is not revealed.
  if (!form || !record || !(await wcFormAccess(context, record)).canView(form.form_key)) {
    return NextResponse.json({ error: 'Form not found.' }, { status: 404 })
  }

  const download = new URL(request.url).searchParams.get('download') === '1'
  const pdf = await renderWcCaseFormPdf(organizationId, form)
  const fileName = wcFormFileName(record.case_number, form.form_key as WcFormKey)

  await recordWcFormEvent(form, download ? 'downloaded' : 'printed', context.user.id, { status: form.status })
  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: download ? 'workers_comp.form_downloaded' : 'workers_comp.form_printed',
    entityType: 'workers_comp_form',
    entityId: form.id,
    afterValue: { case_id: form.case_id, form_key: form.form_key, status: form.status }
  })

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
