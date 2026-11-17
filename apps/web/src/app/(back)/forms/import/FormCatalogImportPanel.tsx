'use client'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { toast } from '@repo/ui/utils/toast'

const MAX_BYTES = 20 * 1024 * 1024

type Summary = {
  dryRun: boolean
  templates: { inFile: number; created: number; updated: number; skipped: number }
  submissions: { inFile: number; created: number; skipped: number; unlinked: number }
  problems: string[]
}

const Count = ({ label, value, testId }: { label: string; value: number; testId: string }) => (
  <div className='rounded-md border px-3 py-2'>
    <div className='text-textSecondary text-xs'>{label}</div>
    <div className='text-lg font-semibold' data-testid={testId}>
      {value}
    </div>
  </div>
)

/** Upload a 1.0 JSON export, dry run it, then import. */
const FormCatalogImportPanel = () => {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)

  const run = async (dryRun: boolean) => {
    if (!file) return

    setPending(true)

    try {
      const body = new FormData()

      body.set('file', file)
      body.set('dryRun', dryRun ? '1' : '0')

      const response = await fetch('/forms/import/run', { method: 'POST', body })
      const result = await response.json().catch(() => ({ error: 'The import failed.' }))

      if (!response.ok) {
        toast('error', result.error || 'The import failed.')

        return
      }

      setSummary(result)

      if (!dryRun) {
        toast('success', `Imported ${result.templates.created} new form${result.templates.created === 1 ? '' : 's'} and ${result.submissions.created} submission${result.submissions.created === 1 ? '' : 's'}.`)
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Card data-testid='form-catalog-import'>
      <CardHeader>
        <CardTitle>Forge 1.0 JSON export</CardTitle>
        <CardDescription>
          A JSON file (up to 20 MB) with formTemplates (or templates) and, optionally, formSubmissions. Active forms are published as version 1; archived forms are
          imported archived. Photos embedded in 1.0 answers are not carried over. Run a dry run first to see what will happen.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <input
            ref={fileRef}
            type='file'
            accept='.json,application/json'
            aria-label='Forge 1.0 JSON file'
            className='text-sm'
            disabled={pending}
            onChange={event => {
              const chosen = event.target.files?.[0] || null

              setSummary(null)

              if (chosen && chosen.size > MAX_BYTES) {
                toast('error', 'The file is larger than 20 MB.')
                event.target.value = ''
                setFile(null)

                return
              }

              setFile(chosen)
            }}
          />
          <Button type='button' variant='outline' disabled={!file || pending} onClick={() => run(true)}>
            {pending ? 'Working...' : 'Dry run'}
          </Button>
          <Button type='button' disabled={!file || pending || !summary?.dryRun} onClick={() => run(false)}>
            Import
          </Button>
        </div>

        {summary ? (
          <div className='flex flex-col gap-3' data-testid='form-import-summary' data-dry-run={summary.dryRun ? 'true' : 'false'}>
            <p className='font-medium'>{summary.dryRun ? 'Dry run: nothing has been saved yet.' : 'Import finished.'}</p>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
              <Count label='Forms in file' value={summary.templates.inFile} testId='import-templates-in-file' />
              <Count label={summary.dryRun ? 'Forms to create' : 'Forms created'} value={summary.templates.created} testId='import-templates-created' />
              <Count label={summary.dryRun ? 'Forms to update' : 'Forms updated'} value={summary.templates.updated} testId='import-templates-updated' />
              <Count label='Forms skipped' value={summary.templates.skipped} testId='import-templates-skipped' />
              <Count label='Submissions in file' value={summary.submissions.inFile} testId='import-submissions-in-file' />
              <Count label={summary.dryRun ? 'Submissions to create' : 'Submissions created'} value={summary.submissions.created} testId='import-submissions-created' />
              <Count label='Submissions skipped' value={summary.submissions.skipped} testId='import-submissions-skipped' />
              <Count label='Without a form' value={summary.submissions.unlinked} testId='import-submissions-unlinked' />
            </div>
            {summary.problems.length ? (
              <div>
                <p className='text-sm font-medium'>Problems ({summary.problems.length})</p>
                <ul className='text-textSecondary list-disc ps-5 text-sm' data-testid='import-problems'>
                  {summary.problems.map((problem, index) => (
                    <li key={index}>{problem}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default FormCatalogImportPanel
