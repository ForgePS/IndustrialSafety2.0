'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { recordPermitGasTest } from '@/app/(back)/permits/workflowActions'
import { formatWhen } from '@/components/permits/format'
import { gasProblems, type PermitSettings, type PermitType } from '@/lib/forgePermitRules'

const EMPTY = { o2: '', lel: '', h2s: '', co: '', otherGas: '', otherValue: '', otherLimit: '', instrument: '', bumpTested: false, testPoint: '', note: '' }

const inputClass = 'bg-background rounded-md border px-3 py-1.5 text-sm'

const show = (value: unknown, unit = '') => (value === null || value === undefined || value === '' ? '-' : `${Number(value)}${unit}`)

/** Port slice 18: record an atmospheric test (with a live pass / fail preview) and the history of tests. */
const GasTestPanel = ({
  permitId,
  permitType,
  tests,
  settings,
  canRecord,
  timeZone
}: {
  permitId: string
  permitType: PermitType
  tests: any[]
  settings: PermitSettings
  canRecord: boolean
  timeZone: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState(EMPTY)
  const set = (key: keyof typeof EMPTY, value: string | boolean) => setForm(current => ({ ...current, [key]: value }))
  const lelMax = permitType === 'hot_work' ? settings.hot_work_lel_max : settings.lel_max
  const entered = [form.o2, form.lel, form.h2s, form.co, form.otherValue].some(value => value !== '')

  const problems = gasProblems(
    permitType,
    {
      o2_pct: form.o2 === '' ? null : Number(form.o2),
      lel_pct: form.lel === '' ? null : Number(form.lel),
      h2s_ppm: form.h2s === '' ? null : Number(form.h2s),
      co_ppm: form.co === '' ? null : Number(form.co),
      other_gas: form.otherGas,
      other_value: form.otherValue === '' ? null : Number(form.otherValue),
      other_limit: form.otherLimit === '' ? null : Number(form.otherLimit)
    },
    settings
  )

  const latest = tests[0]
  const latestAge = latest ? Math.floor((Date.now() - new Date(latest.tested_at).getTime()) / 60_000) : null

  const record = () =>
    startTransition(async () => {
      const result = await recordPermitGasTest(permitId, form)

      if (result.error) return void toast('error', result.error)
      toast(result.passed ? 'success' : 'error', result.message || 'Saved.')
      setForm(EMPTY)
      router.refresh()
    })

  const field = (key: keyof typeof EMPTY, label: string, hint?: string) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <input type='number' step='0.1' min='0' name={key} className={inputClass} value={form[key] as string} onChange={event => set(key, event.target.value)} />
      {hint ? <span className='text-muted-foreground text-xs font-normal'>{hint}</span> : null}
    </label>
  )

  return (
    <div className='flex flex-col gap-4' data-gas-tests>
      <p className='text-muted-foreground text-sm'>
        Limits: oxygen {settings.o2_min}% to {settings.o2_max}%, LEL below {lelMax}%, H2S below {settings.h2s_max} ppm, CO below {settings.co_max} ppm. A test counts for{' '}
        {settings.gas_test_valid_minutes} minutes.
        {latest ? (
          <>
            {' '}
            Last test {latestAge} min ago ({latest.passed ? 'passed' : 'failed'}){latestAge !== null && latestAge > settings.gas_test_valid_minutes ? ', test again' : ''}.
          </>
        ) : null}
      </p>

      {canRecord ? (
        <div className='flex flex-col gap-3 rounded-md border p-3' data-gas-form>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            {field('o2', 'Oxygen (%)', permitType === 'confined_space' ? 'Needed' : undefined)}
            {field('lel', 'LEL (%)', 'Needed')}
            {field('h2s', 'H2S (ppm)')}
            {field('co', 'CO (ppm)')}
          </div>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Other gas
              <input type='text' name='otherGas' maxLength={80} className={inputClass} value={form.otherGas} onChange={event => set('otherGas', event.target.value)} />
            </label>
            {field('otherValue', 'Other reading')}
            {field('otherLimit', 'Other limit')}
          </div>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Instrument
              <input type='text' name='instrument' maxLength={200} className={inputClass} value={form.instrument} onChange={event => set('instrument', event.target.value)} />
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Test point
              <input type='text' name='testPoint' maxLength={200} className={inputClass} value={form.testPoint} onChange={event => set('testPoint', event.target.value)} />
            </label>
            <label className='flex items-center gap-2 pt-6 text-sm font-medium'>
              <input type='checkbox' name='bumpTested' checked={form.bumpTested} onChange={event => set('bumpTested', event.target.checked)} />
              Bump tested today
            </label>
          </div>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Note
            <input type='text' name='note' maxLength={1000} className={inputClass} value={form.note} onChange={event => set('note', event.target.value)} />
          </label>
          {entered ? (
            problems.length ? (
              <p className='text-destructive text-sm font-medium' data-gas-preview='fail'>
                This test will fail: {problems.join('; ')}. Recording it on an active permit suspends it.
              </p>
            ) : (
              <p className='text-sm font-medium text-green-700 dark:text-green-400' data-gas-preview='pass'>
                Within limits.
              </p>
            )
          ) : null}
          <div>
            <Button type='button' disabled={pending} onClick={record} data-record-gas-test>
              {pending ? 'Saving...' : 'Record gas test'}
            </Button>
          </div>
        </div>
      ) : null}

      {tests.length ? (
        <div className='overflow-x-auto'>
          <table className='w-full text-sm' data-gas-history>
            <thead>
              <tr className='text-muted-foreground border-b text-left'>
                <th className='py-2 pr-3 font-medium'>Tested</th>
                <th className='py-2 pr-3 font-medium'>O2</th>
                <th className='py-2 pr-3 font-medium'>LEL</th>
                <th className='py-2 pr-3 font-medium'>H2S</th>
                <th className='py-2 pr-3 font-medium'>CO</th>
                <th className='py-2 pr-3 font-medium'>Other</th>
                <th className='py-2 pr-3 font-medium'>Instrument</th>
                <th className='py-2 pr-3 font-medium'>Result</th>
              </tr>
            </thead>
            <tbody>
              {tests.map(test => (
                <tr key={test.id} className='border-b align-top' data-gas-test={test.passed ? 'passed' : 'failed'}>
                  <td className='py-2 pr-3 whitespace-nowrap'>
                    {formatWhen(test.tested_at, timeZone)}
                    {test.test_point ? <div className='text-muted-foreground text-xs'>{test.test_point}</div> : null}
                  </td>
                  <td className='py-2 pr-3'>{show(test.o2_pct, '%')}</td>
                  <td className='py-2 pr-3'>{show(test.lel_pct, '%')}</td>
                  <td className='py-2 pr-3'>{show(test.h2s_ppm, ' ppm')}</td>
                  <td className='py-2 pr-3'>{show(test.co_ppm, ' ppm')}</td>
                  <td className='py-2 pr-3'>{test.other_gas ? `${test.other_gas} ${show(test.other_value)}${test.other_limit !== null ? ` (limit ${show(test.other_limit)})` : ''}` : '-'}</td>
                  <td className='py-2 pr-3'>
                    {test.instrument || '-'}
                    {test.bump_tested ? <div className='text-muted-foreground text-xs'>Bump tested</div> : null}
                  </td>
                  <td className='py-2 pr-3'>
                    {test.passed ? <Badge variant='tonalSuccess'>Pass</Badge> : <Badge variant='destructive'>Fail</Badge>}
                    {test.problems?.length ? <div className='text-destructive mt-1 text-xs'>{test.problems.join('; ')}</div> : null}
                    {test.note ? <div className='text-muted-foreground mt-1 text-xs'>{test.note}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>No gas tests recorded yet.</p>
      )}
    </div>
  )
}

export default GasTestPanel
