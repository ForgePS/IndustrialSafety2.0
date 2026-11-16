import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import { DOT_RECORD_CATEGORY_LABELS } from '@/lib/forgeDot'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import DotRecordForm, { EMPTY_DOT_RECORD } from '../DotRecordForm'
import { recordFormOptions } from '../recordOptions'

export const metadata: Metadata = { title: 'New DOT Record' }

const NewDotRecordPage = async ({ searchParams }: { searchParams: Promise<{ category?: string }> }) => {
  const context = await requireTenantPermission('dot.edit')
  const { category } = await searchParams
  const options = await recordFormOptions(context)
  const initialCategory = category && category in DOT_RECORD_CATEGORY_LABELS ? category : EMPTY_DOT_RECORD.category

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader active='records' allowed={allowedFrom(context)} />
      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle>New DOT record</CardTitle>
          <CardDescription>
            Roadside inspections, accidents, drug and alcohol events and other DOT paperwork. Attach the reports after you create it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DotRecordForm
            initial={{ ...EMPTY_DOT_RECORD, category: initialCategory, record_date: new Date().toISOString().slice(0, 10) }}
            categories={DOT_RECORD_CATEGORY_LABELS}
            canEdit
            {...options}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default NewDotRecordPage
