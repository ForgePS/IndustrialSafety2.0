import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DotFileSlot, { type DotUpload } from '@/components/dot/DotFileSlot'
import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import DotStatusPill from '@/components/dot/DotStatusPill'
import { DOT_RECORD_CATEGORY_LABELS, getDotRecordsForPerson, getDotSettings, getDriverFileDetail, personName, personWithinScope } from '@/lib/forgeDot'
import {
  DOT_CREDENTIAL_SLOTS,
  DOT_DOCUMENT_GROUP_LABELS,
  DOT_DOCUMENTS,
  DOT_ISSUE_LABELS,
  cdlNumberRequired,
  diabeticEyeExamRequired,
  dqfIssues,
  dotDueOverdueLabel,
  dqfWorksheet,
  formatUsDate,
  medicalCertificateRequired,
  nextDueDate
} from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import DriverCredentialsForm from './DriverCredentialsForm'
import DqfDocumentRow from './DqfDocumentRow'
import DriverFileArchiveButton from './DriverFileArchiveButton'

export const metadata: Metadata = { title: 'Driver File' }

const DriverFilePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('dot.view')
  const organizationId = context.activeOrganization.id
  const allowed = allowedFrom(context)

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const detail = await getDriverFileDetail({ organizationId, fileId: id })

  if (!detail || !(await personWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, person: detail.person }))) notFound()

  const { file, person, documents, uploads, roster } = detail

  const [settings, relatedRecords] = await Promise.all([
    getDotSettings(organizationId),
    getDotRecordsForPerson({ organizationId, personnelId: file.personnel_id })
  ])

  const today = new Date().toISOString().slice(0, 10)
  const fileCounts: Record<string, number> = {}

  for (const upload of uploads) fileCounts[upload.slot] = (fileCounts[upload.slot] || 0) + 1

  const input = { file, person, documents, fileCounts, hiddenDocuments: settings.hidden_document_types, todayIso: today }
  const worksheet = dqfWorksheet(input)
  const issues = dqfIssues(input)
  const items = new Map(worksheet.map(item => [item.key, item]))
  const byType = new Map(documents.map((row: any) => [row.document_type, row]))
  const uploadsFor = (slot: string): DotUpload[] => uploads.filter((upload: any) => upload.slot === slot)
  const canEdit = allowed('dot.edit') && !file.archived_at
  const canApprove = allowed('dot.approve')

  const groups = (Object.keys(DOT_DOCUMENT_GROUP_LABELS) as Array<keyof typeof DOT_DOCUMENT_GROUP_LABELS>).map(group => ({
    group,
    docs: DOT_DOCUMENTS.filter(def => def.group === group && !settings.hidden_document_types.includes(def.key))
  }))

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader
        active='drivers'
        allowed={allowed}
        title={personName(person)}
        subtitle={[
          file.file_number,
          person?.employee_number ? '#' + person.employee_number : null,
          person?.locations?.name,
          file.license_class === 'non_cdl' ? 'Non-CDL driver' : 'CDL driver',
          person?.employment_type ? String(person.employment_type).replace('_', ' ') : null
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {roster ? (
              <Link className='text-primary self-center text-sm hover:underline' href={'/dot/company-drivers/' + roster.id}>
                Company-driver MVR record
              </Link>
            ) : null}
            <Link className='text-primary self-center text-sm hover:underline' href={'/personnel/' + file.personnel_id}>
              Personnel file
            </Link>
            {allowed('dot.edit') ? <DriverFileArchiveButton fileId={file.id} archived={Boolean(file.archived_at)} /> : null}
          </>
        }
      />

      {file.archived_at ? (
        <div className='rounded-lg border border-dashed p-4 text-sm'>
          This file was archived on {new Date(file.archived_at).toLocaleDateString()}
          {file.archived_reason === 'personnel_inactive'
            ? ' because the driver is no longer active.'
            : file.archived_reason === 'dot_driver_off'
              ? ' because the person is no longer marked as a DOT driver. Turning DOT driver back on in Personnel restores it.'
              : '.'}
        </div>
      ) : null}

      <div className='grid gap-6 xl:grid-cols-[1fr_360px]'>
        <Card>
          <CardHeader>
            <CardTitle>Credentials</CardTitle>
            <CardDescription>
              Next due {formatUsDate(nextDueDate(file, person)) || '—'}.
              {!medicalCertificateRequired(person) ? ' Seasonal drivers are exempt from the medical certificate.' : ''}
              {diabeticEyeExamRequired(file) ? ' Restrictions mention diabetes, so a diabetic eye exam is required.' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-col divide-y rounded-lg border'>
              {DOT_CREDENTIAL_SLOTS.map(slot => {
                const item = items.get(slot)!

                return (
                  <div key={slot} className='flex flex-wrap items-center justify-between gap-3 p-3' data-worksheet-item={slot}>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>{item.label}</span>
                      <DotStatusPill tone={item.tone}>{item.text}</DotStatusPill>
                    </div>
                    <DotFileSlot parentType='dqf' parentId={file.id} slot={slot} files={uploadsFor(slot)} canEdit={canEdit} label={item.label} />
                  </div>
                )
              })}
            </div>
            <DriverCredentialsForm
              key={file.updated_at}
              fileId={file.id}
              canEdit={canEdit}
              cdlRequired={cdlNumberRequired(file)}
              initial={{
                license_class: file.license_class,
                license_number: file.license_number || '',
                license_state: file.license_state || '',
                license_expires_on: file.license_expires_on || '',
                driver_restrictions: file.driver_restrictions || '',
                medical_certificate_expires_on: file.medical_certificate_expires_on || '',
                national_registry_number: file.national_registry_number || '',
                registry_verified: Boolean(file.registry_verified),
                diabetic_eye_exam_expires_on: file.diabetic_eye_exam_expires_on || '',
                mvr_completed_on: file.mvr_completed_on || '',
                mvr_expires_on: file.mvr_expires_on || '',
                notes: file.notes || ''
              }}
            />
          </CardContent>
        </Card>

        <Card className='self-start'>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>{issues.length ? `${issues.length} item${issues.length === 1 ? '' : 's'}` : 'This file is complete.'}</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2 text-sm'>
            {issues.map((issue, index) => (
              <a key={index} href={'#dqf-' + issue.slot} className='flex items-center justify-between gap-2 hover:underline'>
                <span>{issue.label}</span>
                <DotStatusPill tone={issue.kind === 'expiring' ? 'pending' : 'critical'}>
                  {issue.kind === 'missingDocuments' ? 'Missing' : DOT_ISSUE_LABELS[issue.kind]}
                </DotStatusPill>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>

      {groups.map(({ group, docs }) =>
        docs.length ? (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{DOT_DOCUMENT_GROUP_LABELS[group]}</CardTitle>
              <CardDescription>The date is when the document was placed in the file.</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col divide-y rounded-lg'>
              {docs.map(def => {
                const item = items.get(def.key)!
                const row: any = byType.get(def.key)

                return (
                  <DqfDocumentRow
                    key={def.key + (row?.updated_at || '')}
                    fileId={file.id}
                    def={def}
                    tone={item.tone}
                    statusText={item.text}
                    initial={{ placedOn: row?.placed_on || '', onFile: row?.on_file || '', textValues: row?.text_values || {} }}
                    canEdit={canEdit && (def.key !== 'dqf_review' || canApprove)}
                    uploads={<DotFileSlot parentType='dqf' parentId={file.id} slot={def.key} files={uploadsFor(def.key)} canEdit={canEdit} label={def.label} />}
                  />
                )
              })}
            </CardContent>
          </Card>
        ) : null
      )}

      <Card data-related-dot-records>
        <CardHeader>
          <CardTitle>Related DOT records</CardTitle>
          <CardDescription>Roadside inspections, accidents, drug and alcohol events and other records for this driver.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col divide-y'>
          {relatedRecords.length ? (
            relatedRecords.map((record: any) => {
              const due = dotDueOverdueLabel(record, today)

              return (
                <Link
                  key={record.id}
                  href={'/dot/records/' + record.id}
                  className='hover:bg-secondary/50 flex flex-wrap items-center justify-between gap-2 py-2'
                  data-related-dot-record={record.record_number}
                >
                  <span>
                    <span className='font-semibold'>{record.title}</span>
                    <span className='text-textSecondary ml-2 text-xs'>
                      {record.record_number} · {DOT_RECORD_CATEGORY_LABELS[record.category] || record.category}
                      {record.record_date ? ' · ' + formatUsDate(record.record_date) : ''}
                    </span>
                  </span>
                  <span className='flex items-center gap-2'>
                    {due ? <DotStatusPill tone={due.overdue ? 'critical' : 'muted'}>{due.text}</DotStatusPill> : null}
                    <DotStatusPill tone={record.status === 'open' ? 'pending' : 'muted'}>{record.status === 'open' ? 'Open' : 'Closed'}</DotStatusPill>
                  </span>
                </Link>
              )
            })
          ) : (
            <p className='text-textSecondary py-2 text-sm'>No DOT records for this driver.</p>
          )}
          {allowed('dot.edit') ? (
            <Link className='text-primary pt-2 text-sm hover:underline' href={'/dot/records/new?personnel=' + file.personnel_id}>
              New DOT record
            </Link>
          ) : null}
        </CardContent>
      </Card>

      {settings.hidden_document_types.length ? (
        <p className='text-textSecondary text-xs'>
          Not used by your organization: {DOT_DOCUMENTS.filter(def => settings.hidden_document_types.includes(def.key)).map(def => def.label).join(', ')}.
          {allowed('dot.settings') ? ' Change this in DOT Settings.' : ''}
        </p>
      ) : null}
    </div>
  )
}

export default DriverFilePage
