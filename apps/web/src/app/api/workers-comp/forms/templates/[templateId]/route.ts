import { NextResponse } from 'next/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getWcTemplateFile } from '@/lib/forgeWcForms'
import { WC_FORM_DEFINITIONS } from '@/lib/forgeWcFormsRules'
import type { WcFormKey } from '@/lib/forgeWcFormsRules'

export const dynamic = 'force-dynamic'

/** The blank form: the company's original PDF, served byte for byte so it prints exactly as it always has. */
export const GET = async (request: Request, { params }: { params: Promise<{ templateId: string }> }) => {
  const context = await requireTenantPermission('workers_comp.view')
  const { templateId } = await params
  const organizationId = context.activeOrganization.id
  const file = await getWcTemplateFile(organizationId, templateId).catch(() => null)

  const allowed = (key: string) => context.access.effective.some(item => item.permissionKey === key && item.allowed)
  const medical = file ? WC_FORM_DEFINITIONS[file.template.form_key as WcFormKey]?.medical : false

  if (!file || (medical && !allowed('workers_comp.medical.view') && !allowed('workers_comp.medical.manage'))) {
    return NextResponse.json({ error: 'Form not found.' }, { status: 404 })
  }

  const download = new URL(request.url).searchParams.get('download') === '1'

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.blank_form_opened',
    entityType: 'workers_comp_form_template',
    entityId: templateId,
    afterValue: { form_key: file.template.form_key, download }
  })

  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${String(file.template.file_name).replace(/[^A-Za-z0-9 ._()-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
