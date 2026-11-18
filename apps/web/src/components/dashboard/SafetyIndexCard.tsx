'use client'

import { useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { cn } from '@repo/ui/lib/utils'

import type { SafetyIndexPeriod } from '@/lib/forgeDashboard'

const GRADE_TONE: Record<string, string> = {
  A: 'text-success',
  B: 'text-success',
  C: 'text-warning',
  D: 'text-warning',
  F: 'text-destructive'
}

/** 1.0's Safety Index with its 6-month / 12-month switch, plus the DOT file compliance score when the viewer has DOT. */
const SafetyIndexCard = ({ periods, dotCompliance }: { periods: SafetyIndexPeriod[]; dotCompliance: number | null }) => {
  const [period, setPeriod] = useState(periods[periods.length - 1]?.period || '1y')
  const current = periods.find(item => item.period === period) || periods[0]

  return (
    <Card className='h-full' data-testid='dashboard-safety-index'>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <div>
            <CardTitle>Safety Index</CardTitle>
            <CardDescription>{current?.label}</CardDescription>
          </div>
          <div className='border-border flex rounded-md border p-0.5 text-xs' role='group' aria-label='Safety index period'>
            {periods.map(item => (
              <button
                key={item.period}
                type='button'
                aria-pressed={item.period === period}
                className={cn('rounded px-2 py-1', item.period === period ? 'bg-primary text-primary-foreground' : 'text-textSecondary')}
                onClick={() => setPeriod(item.period)}
              >
                {item.period === '6m' ? '6 months' : '12 months'}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {current ? (
          <div className='flex items-end gap-3'>
            <span className='text-textPrimary text-5xl font-bold' data-testid='safety-score'>
              {current.score}
            </span>
            <span className={cn('pb-1 text-2xl font-bold', GRADE_TONE[current.grade])} data-testid='safety-grade'>
              {current.grade}
            </span>
          </div>
        ) : null}
        {current ? (
          <dl className='text-textSecondary grid grid-cols-2 gap-x-4 gap-y-1 text-sm'>
            <dt>Open incidents</dt>
            <dd className='text-textPrimary text-right font-medium'>
              {current.openIncidents} of {current.totalIncidents}
            </dd>
            <dt>Inspections</dt>
            <dd className='text-textPrimary text-right font-medium'>{current.inspections}</dd>
            <dt>Training completed</dt>
            <dd className='text-textPrimary text-right font-medium'>{current.training}</dd>
            {dotCompliance !== null ? (
              <>
                <dt>DOT files compliant</dt>
                <dd className='text-textPrimary text-right font-medium' data-testid='safety-dot'>
                  {dotCompliance}%
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
        <p className='text-textSecondary text-xs'>Starts at 100, loses points for open incidents, and gains for closed incidents, inspections and training in the period.</p>
      </CardContent>
    </Card>
  )
}

export default SafetyIndexCard
