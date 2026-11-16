import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DotFileSlot from '@/components/dot/DotFileSlot'
import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import DotStatusPill from '@/components/dot/DotStatusPill'
import { DOT_RECORD_CATEGORY_LABELS, personName } from '@/lib/forgeDot'
import { loadDotRecordInScope } from '@/lib/forgeDotServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import DotRecordForm from '../DotRecordForm'
import { recordFormOptions } from '../recordOptions'
import RecordStatusButton from './RecordStatusButton'

export const metadata: Metadata = { title: 'DOT Record' }

type Options = Awaited<ReturnType<typeof recordFormOptions>>

const DotRecordPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('dot.view')
  const allowed = allowedFrom(context)

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const loaded = await loadDotRecordInScope(context, id)

  if (!('ok' in loaded)) notFound()

  const { row: record, supabase } = loaded
  const canEdit = allowed('dot.edit')

  const { data: uploads } = await supabase
    .from('forge_dot_files')
    .select('id, slot, file_name, content_type, created_at')
    .eq('record_id', record.id)
    .is('removed_at', null)
    .order('created_at')

  let options: Options

  if (canEdit) options = await recordFormOptions(context)
  else {
    // Read-only viewers only need the names already on the record.
    const [{ data: person }, { data: location }] = await Promise.all([
      record.personnel_id
        ? supabase.from('forge_personnel').select('id, first_name, last_name, preferred_name').eq('id', record.personnel_id).maybeSingle()
        : Promise.resolve({ data: null }),
      record.location_id ? supabase.from('locations').select('id, name').eq('id', record.location_id).maybeSingle() : Promise.resolve({ data: null })
    ])

    options = {
      people: person ? [{ id: person.id, name: personName(person), driver: true }] : [],
      locations: location ? [{ id: location.id, name: location.name }] : [],
      allowNoDriver: true
    }
  }

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader
        active='records'
        allowed={allowed}
        title={record.title}
        subtitle={`${record.record_number} · ${DOT_RECORD_CATEGORY_LABELS[record.category] || record.category}`}
        actions={
          <>
            <span className='self-center'>
              <DotStatusPill tone={record.status === 'open' ? 'pending' : 'muted'}>{record.status === 'open' ? 'Open' : 'Closed'}</DotStatusPill>
            </span>
            {canEdit ? <RecordStatusButton recordId={record.id} status={record.status} /> : null}
            <Link className='text-primary self-center text-sm hover:underline' href='/dot/records'>
              All records
            </Link>
          </>
        }
      />

      <div className='grid gap-6 xl:grid-cols-[1fr_380px]'>
        <Card>
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent>
            <DotRecordForm
              key={record.updated_at}
              recordId={record.id}
              canEdit={canEdit}
              categories={DOT_RECORD_CATEGORY_LABELS}
              initial={{
                category: record.category,
                title: record.title || '',
                record_date: record.record_date || '',
                personnel_id: record.personnel_id || '',
                location_id: record.location_id || '',
                description: record.description || '',
                outcome: record.outcome || ''
              }}
              {...options}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            <DotFileSlot parentType='record' parentId={record.id} slot='attachment' files={uploads || []} canEdit={canEdit} label='Attachment' />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default DotRecordPage
