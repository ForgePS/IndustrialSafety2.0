import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import { getTrainingLibrary } from '@/lib/forgeTrainingReports'
import { MATERIAL_TOPIC_LABELS, MATERIAL_TOPICS, type MaterialTopic } from '@/lib/forgeTrainingReportRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Training Library' }

const sizeLabel = (bytes: number) => (bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`)
const pill = (active: boolean) => 'rounded-full border px-3 py-1 text-sm ' + (active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')

/** Every course's materials in one place, by topic (1.0 training materials panel). Managers open them from the course. */
const TrainingLibraryPage = async ({ searchParams }: { searchParams: Promise<{ topic?: string; q?: string }> }) => {
  const context = await requireTenantPermission('training.manage_content')
  const { topic, q } = await searchParams
  const needle = String(q || '').trim().toLowerCase()
  const all = await getTrainingLibrary(context.activeOrganization.id)
  const counts = new Map<string, number>()

  for (const item of all) counts.set(item.topic, (counts.get(item.topic) || 0) + 1)

  const rows = all
    .filter(item => !topic || item.topic === topic)
    .filter(item => !needle || [item.title, item.description, item.file_name, item.forge_training_courses?.title].some(text => String(text || '').toLowerCase().includes(needle)))

  const href = (next: string) => '/training/library' + (next || needle ? '?' + new URLSearchParams({ ...(next ? { topic: next } : {}), ...(needle ? { q: needle } : {}) }).toString() : '')

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Training Library</h1>
          <p className='text-textSecondary mt-2'>Course materials across every course. Set topics and folders on each course&apos;s Content page.</p>
        </div>
        <Button variant='tonalDefault' asChild>
          <Link href='/training'>Back to Training</Link>
        </Button>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Link className={pill(!topic)} href={href('')}>
          All ({all.length})
        </Link>
        {MATERIAL_TOPICS.filter(key => counts.get(key)).map(key => (
          <Link key={key} className={pill(topic === key)} href={href(key)}>
            {MATERIAL_TOPIC_LABELS[key]} ({counts.get(key)})
          </Link>
        ))}
        <form action='/training/library' className='ml-auto flex gap-2'>
          {topic ? <input type='hidden' name='topic' value={topic} /> : null}
          <input name='q' aria-label='Search materials' defaultValue={q || ''} placeholder='Search materials' className='border-input bg-card h-[34px] w-56 rounded-md border px-3 text-sm' />
          <Button size='sm' variant='outline' type='submit'>
            Search
          </Button>
        </form>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Folder</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map(item => (
                <TableRow key={item.id} data-library-row={item.title}>
                  <TableCell>
                    <div className='font-semibold'>{item.title}</div>
                    <div className='text-textSecondary text-xs'>{item.file_name}</div>
                  </TableCell>
                  <TableCell>
                    <Link className='hover:underline' href={`/training/courses/${item.course_id}/content`}>
                      {item.forge_training_courses?.title}
                    </Link>
                  </TableCell>
                  <TableCell>{item.forge_training_material_folders?.name || '—'}</TableCell>
                  <TableCell>{MATERIAL_TOPIC_LABELS[item.topic as MaterialTopic] || item.topic}</TableCell>
                  <TableCell>{sizeLabel(item.size_bytes)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className='py-10 text-center'>
                  No materials{topic || needle ? ' match' : ' yet'}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default TrainingLibraryPage
