import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DotFileSlot from '@/components/dot/DotFileSlot'
import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import DotStatusPill, { issueTone } from '@/components/dot/DotStatusPill'
import { getCompanyDriverDetail, personName, personWithinScope } from '@/lib/forgeDot'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { DOT_ISSUE_LABELS, companyDriverIssues, formatUsDate } from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import CompanyDriverForm from './CompanyDriverForm'
import CompleteSampleForm from './CompleteSampleForm'
import LinkPersonnelForm from './LinkPersonnelForm'

export const metadata: Metadata = { title: 'Company Driver' }

const EVENT_LABELS: Record<string, string> = {
  consent_received: 'MVR consent received',
  mvr_received: 'MVR received',
  sample_selected: 'Selected for sample',
  sample_completed: 'Sampled MVR recorded',
  status_changed: 'Status changed'
}

const CompanyDriverPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('dot.view')
  const organizationId = context.activeOrganization.id
  const allowed = allowedFrom(context)

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const detail = await getCompanyDriverDetail({ organizationId, driverId: id })

  if (!detail || !(await personWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, person: detail.person }))) notFound()

  const { driver, person, uploads, events, dqf } = detail
  const canEdit = allowed('dot.edit')
  const today = new Date().toISOString().slice(0, 10)
  const consentUploads = uploads.filter((item: any) => item.slot === 'mvr_consent')
  const issues = companyDriverIssues(driver, { consentUploads: consentUploads.length, todayIso: today, year: Number(today.slice(0, 4)) })
  const slotFiles = (slot: string) => uploads.filter((item: any) => item.slot === slot)

  let candidates: Array<{ id: string; name: string }> = []

  if (canEdit && !driver.personnel_id) {
    const editPermission = context.access.effective.find(item => item.permissionKey === 'dot.edit')!

    candidates = (await getScopedPersonnel({ organizationId, userId: context.user.id, permission: editPermission })).map((item: any) => ({
      id: item.id,
      name: personName(item) + (item.employee_number ? ' · #' + item.employee_number : '')
    }))
  }

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader
        active='company-drivers'
        allowed={allowed}
        title={driver.driver_name}
        subtitle={['Company driver', driver.employee_number ? '#' + driver.employee_number : null, person ? personName(person) + ' in personnel' : 'Not linked to personnel'].filter(Boolean).join(' · ')}
        actions={
          <>
            {dqf ? (
              <Link className='text-primary self-center text-sm hover:underline' href={'/dot/drivers/' + dqf.id}>
                Driver qualification file {dqf.file_number}
              </Link>
            ) : null}
            {person ? (
              <Link className='text-primary self-center text-sm hover:underline' href={'/personnel/' + person.id}>
                Personnel file
              </Link>
            ) : null}
          </>
        }
      />

      <div className='grid gap-6 xl:grid-cols-[1fr_380px]'>
        <Card>
          <CardHeader>
            <CardTitle>Driver</CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyDriverForm
              key={driver.updated_at}
              driverId={driver.id}
              canEdit={canEdit}
              initial={{
                driver_name: driver.driver_name || '',
                employee_number: driver.employee_number || '',
                license_number: driver.license_number || '',
                license_state: driver.license_state || '',
                license_expires_on: driver.license_expires_on || '',
                date_of_birth: driver.date_of_birth || '',
                status: driver.status,
                mvr_consent_on: driver.mvr_consent_on || '',
                initial_mvr_on: driver.initial_mvr_on || '',
                last_mvr_on: driver.last_mvr_on || '',
                next_mvr_due_on: driver.next_mvr_due_on || '',
                insurance_effective_on: driver.insurance_effective_on || '',
                notes: driver.notes || ''
              }}
            />
          </CardContent>
        </Card>

        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-wrap gap-1'>
              {issues.length ? (
                issues.map(issue => (
                  <DotStatusPill key={issue.kind} tone={issueTone(issue.kind)}>
                    {DOT_ISSUE_LABELS[issue.kind]}: {issue.detail}
                  </DotStatusPill>
                ))
              ) : (
                <span className='text-textSecondary text-sm'>Nothing.</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Uploading a consent form or MVR report dates this record. A new MVR sets the next one due a year out, here and on the driver file.</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {[
                ['mvr_consent', 'MVR consent form'],
                ['mvr_report', 'MVR report'],
                ['license', "Driver's license"]
              ].map(([slot, label]) => (
                <div key={slot}>
                  <div className='mb-1 text-sm font-medium'>{label}</div>
                  <DotFileSlot parentType='company_driver' parentId={driver.id} slot={slot} files={slotFiles(slot)} canEdit={canEdit} label={label} />
                </div>
              ))}
            </CardContent>
          </Card>

          {driver.sample_year ? (
            <Card data-mvr-sample>
              <CardHeader>
                <CardTitle>{driver.sample_year} MVR sample</CardTitle>
                <CardDescription>
                  Selected {driver.sample_selected_at ? new Date(driver.sample_selected_at).toLocaleDateString() : ''}.
                  {driver.sample_completed_at ? ` Recorded ${new Date(driver.sample_completed_at).toLocaleDateString()}.` : ''}
                </CardDescription>
              </CardHeader>
              {!driver.sample_completed_at && canEdit ? (
                <CardContent>
                  <CompleteSampleForm driverId={driver.id} />
                </CardContent>
              ) : null}
            </Card>
          ) : null}

          {!driver.personnel_id && canEdit ? (
            <Card>
              <CardHeader>
                <CardTitle>Link to personnel</CardTitle>
                <CardDescription>Links this roster row to a person and marks them as a company driver.</CardDescription>
              </CardHeader>
              <CardContent>
                <LinkPersonnelForm driverId={driver.id} candidates={candidates} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>MVR history</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col divide-y text-sm'>
          {events.length ? (
            events.map((event: any) => (
              <div key={event.id} className='flex flex-wrap justify-between gap-2 py-2'>
                <span>
                  <span className='font-medium'>{EVENT_LABELS[event.kind] || event.kind}</span>
                  {event.note ? <span className='text-textSecondary'> · {event.note}</span> : null}
                </span>
                <span className='text-textSecondary'>{formatUsDate(event.occurred_on)}</span>
              </div>
            ))
          ) : (
            <p className='text-textSecondary py-2'>No MVR activity yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default CompanyDriverPage
