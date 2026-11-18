'use client'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { toast } from '@repo/ui/utils/toast'

type Row = { line: number; label: string; action: 'create' | 'update' | 'unchanged' | 'skip'; vehicleId: string | null; changes: string[]; problems: string[]; warnings: string[] }
type Summary = { dryRun: boolean; rows: Row[]; created: number; updated: number; unchanged: number; skipped: number; unknownColumns: string[] }

const ACTION_LABEL: Record<Row['action'], string> = { create: 'Add', update: 'Update', unchanged: 'No change', skip: 'Skip' }

/** Port slice 11: upload a vehicle CSV, review the dry run, then import. */
const FleetImportForm = () => {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = async (dryRun: boolean) => {
    const file = fileRef.current?.files?.[0]

    if (!file) {
      setError('Choose a CSV file.')

      return
    }

    setBusy(true)
    setError(null)

    try {
      const body = new FormData()

      body.set('file', file)
      body.set('dryRun', dryRun ? '1' : '0')

      const response = await fetch('/fleet/import/run', { method: 'POST', body })
      const result = await response.json().catch(() => ({ error: 'The import failed.' }))

      if (!response.ok) {
        setError(result.error || 'The import failed.')
        setSummary(null)

        return
      }

      setSummary(result)

      if (!dryRun) {
        toast('success', `Import finished: ${result.created} added, ${result.updated} updated.`)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const ready = summary?.dryRun && summary.rows.some(row => row.action === 'create' || row.action === 'update')

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <input
            ref={fileRef}
            type='file'
            accept='.csv,text/csv'
            aria-label='Vehicle CSV file'
            className='block text-sm'
            onChange={() => {
              setSummary(null)
              setError(null)
            }}
          />
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' disabled={busy} onClick={() => send(true)}>
              {busy ? 'Working...' : 'Check file (dry run)'}
            </Button>
            <Button disabled={busy || !ready} onClick={() => send(false)}>
              Import
            </Button>
          </div>
          {error ? (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {summary ? (
        <Card data-testid='fleet-import-summary' data-dry-run={summary.dryRun ? '1' : '0'}>
          <CardHeader>
            <CardTitle>{summary.dryRun ? 'Dry run: nothing has been saved yet' : 'Import finished'}</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <p className='text-sm' data-testid='fleet-import-counts'>
              {summary.dryRun ? 'Would add' : 'Added'} <strong data-count='created'>{summary.created}</strong>, {summary.dryRun ? 'would update' : 'updated'}{' '}
              <strong data-count='updated'>{summary.updated}</strong>, unchanged <strong data-count='unchanged'>{summary.unchanged}</strong>, skipped{' '}
              <strong data-count='skipped'>{summary.skipped}</strong>.
            </p>
            {summary.unknownColumns.length ? <p className='text-sm text-amber-700 dark:text-amber-300'>Columns ignored: {summary.unknownColumns.join(', ')}</p> : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rows.map(row => (
                  <TableRow key={row.line} data-import-line={row.line} data-import-action={row.action}>
                    <TableCell>{row.line}</TableCell>
                    <TableCell>
                      {row.vehicleId && !summary.dryRun ? (
                        <a className='text-primary hover:underline' href={'/fleet/vehicles/' + row.vehicleId}>
                          {row.label}
                        </a>
                      ) : (
                        row.label
                      )}
                    </TableCell>
                    <TableCell className={row.action === 'skip' ? 'text-destructive font-semibold' : 'font-semibold'}>{ACTION_LABEL[row.action]}</TableCell>
                    <TableCell className='text-sm'>
                      {row.problems.map(problem => (
                        <div key={problem} className='text-destructive'>
                          {problem}
                        </div>
                      ))}
                      {row.warnings.map(warning => (
                        <div key={warning} className='text-amber-700 dark:text-amber-300'>
                          {warning}
                        </div>
                      ))}
                      {row.action === 'update' && row.changes.length ? <div className='text-textSecondary'>Changes: {row.changes.join(', ').replace(/_/g, ' ')}</div> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default FleetImportForm
