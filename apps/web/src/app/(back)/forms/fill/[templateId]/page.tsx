import { randomUUID } from 'node:crypto'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import FormSubmissionEditor from '@/components/forms/FormSubmissionEditor'
import { loadLatestTemplateVersion } from '@/lib/forgeFormAccess'
import { formPlacementOptions } from '@/lib/forgeFormSubmissions'
import { getUserNames } from '@/lib/forgeLoto'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Fill Out Form' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FillFormPage = async ({ params }: { params: Promise<{ templateId: string }> }) => {
  const context = await requireTenantPermission('forms.submit')
  const { templateId } = await params
  const organizationId = context.activeOrganization.id

  if (!UUID.test(templateId)) notFound()

  const { data: template } = await (createServiceRoleClient() as any)
    .from('forge_form_templates')
    .select('id, title, description, status')
    .eq('organization_id', organizationId)
    .eq('id', templateId)
    .maybeSingle()

  if (!template) notFound()

  const version = template.status === 'archived' ? null : await loadLatestTemplateVersion({ organizationId, templateId })

  const header = (
    <div>
      <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forms</p>
      <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{version?.title || template.title}</h1>
      {template.description ? <p className='text-textSecondary mt-2 whitespace-pre-wrap'>{template.description}</p> : null}
    </div>
  )

  if (!version) {
    return (
      <div className='flex flex-col gap-6'>
        {header}
        <Card data-form-unavailable>
          <CardHeader>
            <CardTitle>This form cannot be filled out</CardTitle>
            <CardDescription>
              {template.status === 'archived' ? 'The form has been archived.' : 'The form has not been published yet. Ask a form manager to publish it.'}
            </CardDescription>
          </CardHeader>
        </Card>
        <div>
          <Button variant='outline' asChild>
            <Link href='/forms'>Back to forms</Link>
          </Button>
        </div>
      </div>
    )
  }

  const [placement, names] = await Promise.all([
    formPlacementOptions({ organizationId, userId: context.user.id, scope: context.permission.scope ?? null }),
    getUserNames({ organizationId, userIds: [context.user.id] })
  ])

  return (
    <div className='flex flex-col gap-6'>
      {header}
      <p className='text-textSecondary -mt-4 text-sm'>Version {version.version}</p>
      <FormSubmissionEditor
        templateId={template.id}
        submissionId={randomUUID()}
        isNew
        schema={version.schema}
        initialAnswers={{}}
        status={null}
        rowVersion={null}
        locations={placement.locations}
        divisions={placement.divisions}
        initialLocationId={null}
        initialDivisionId={null}
        defaultSignerName={names[context.user.id] || context.user.email || ''}
      />
    </div>
  )
}

export default FillFormPage
