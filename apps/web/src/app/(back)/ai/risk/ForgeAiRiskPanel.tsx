'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { TbChevronDown, TbChevronRight, TbRefresh } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { toast } from '@repo/ui/utils/toast'

import { recalculateForgeAiRisk } from './actions'

type Evidence = { type: string; id: string; reference: string | null }

type Indicator = {
  factor_key: string
  label: string
  available: boolean
  raw_value: number | null
  normalized: number | null
  weight: number
  contribution: number | null
  detail: string
  evidence: Evidence[]
  hidden_evidence: number
}

type Assessment = {
  id: string
  scope_type: 'location' | 'division'
  scope_name: string
  score: number | null
  band: 'low' | 'moderate' | 'elevated' | 'high' | 'insufficient_data'
  model_key: string
  model_version: number
  record_count: number
  available_weight: number
  computed_at: string
  metadata: { reason?: string }
  indicators: Indicator[]
}

const EVIDENCE_ROUTES: Record<string, string> = {
  incident: '/incidents/',
  inspection: '/inspections/',
  task: '/tasks/',
  risk: '/risk-register/',
  observation: '/observations/'
}

const BAND_LABEL: Record<Assessment['band'], string> = {
  low: 'Low',
  moderate: 'Moderate',
  elevated: 'Elevated',
  high: 'High',
  insufficient_data: 'Not enough data'
}

const bandVariant = (band: Assessment['band']) =>
  band === 'high' ? 'destructive' : band === 'elevated' ? 'secondary' : band === 'insufficient_data' ? 'outline' : 'tonalSuccess'

const ForgeAiRiskPanel = ({ assessments, canRecalculate }: { assessments: Assessment[]; canRecalculate: boolean }) => {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState<string | null>(assessments[0]?.id || null)

  const recalculate = () => {
    startTransition(async () => {
      const result = await recalculateForgeAiRisk()

      if ('error' in result) {
        toast('error', result.error || 'Risk recalculation failed.')

        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  return (
    <div className='flex flex-col gap-4'>
      {canRecalculate ? (
        <div className='flex justify-end'>
          <Button onClick={recalculate} disabled={pending}>
            <TbRefresh />
            {pending ? 'Recalculating...' : 'Recalculate Now'}
          </Button>
        </div>
      ) : null}

      {!assessments.length ? (
        <Card>
          <CardContent className='text-textSecondary p-6 text-sm'>
            No risk indicators yet for your locations. They are calculated on the daily Watch schedule
            {canRecalculate ? ', or choose Recalculate Now.' : '.'}
          </CardContent>
        </Card>
      ) : null}

      {assessments.map(assessment => {
        const expanded = open === assessment.id

        return (
          <Card key={assessment.id} data-testid='risk-assessment'>
            <CardHeader className='cursor-pointer' onClick={() => setOpen(expanded ? null : assessment.id)}>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='min-is-0'>
                  <CardTitle className='flex items-center gap-2'>
                    {expanded ? <TbChevronDown /> : <TbChevronRight />}
                    {assessment.scope_name}
                    <Badge size='sm' variant='outline'>
                      {assessment.scope_type === 'location' ? 'Facility' : 'Division'}
                    </Badge>
                  </CardTitle>
                  <CardDescription className='mt-1'>
                    {assessment.band === 'insufficient_data'
                      ? assessment.metadata?.reason || 'Not enough records to score.'
                      : `${assessment.record_count} records, ${Math.round(assessment.available_weight * 100)}% of factors with data`}
                    {' · '}
                    {assessment.model_key} v{assessment.model_version} · {new Date(assessment.computed_at).toLocaleString()}
                  </CardDescription>
                </div>
                <div className='flex items-center gap-3'>
                  <span className='text-2xl font-bold' data-testid='risk-score'>
                    {assessment.score == null ? '—' : assessment.score}
                  </span>
                  <Badge variant={bandVariant(assessment.band) as any}>{BAND_LABEL[assessment.band]}</Badge>
                </div>
              </div>
            </CardHeader>

            {expanded ? (
              <CardContent>
                <div className='flex flex-col divide-y rounded-lg border'>
                  {assessment.indicators.map(indicator => (
                    <div key={indicator.factor_key} className='flex flex-col gap-2 p-3 text-sm'>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <span className='font-semibold'>{indicator.label}</span>
                        <span className='text-textSecondary text-xs'>
                          weight {Math.round(indicator.weight * 100)}%
                          {indicator.available ? ` · contributes ${((indicator.contribution || 0) * 100).toFixed(1)} pts` : ' · no data'}
                        </span>
                      </div>
                      <div className='bg-muted h-1.5 overflow-hidden rounded-full'>
                        <div className='bg-primary h-full' style={{ width: `${Math.round((indicator.normalized || 0) * 100)}%` }} />
                      </div>
                      <div className='text-textSecondary'>{indicator.detail}</div>
                      {indicator.evidence.length || indicator.hidden_evidence ? (
                        <div className='flex flex-wrap gap-2'>
                          {indicator.evidence.map(item =>
                            EVIDENCE_ROUTES[item.type] ? (
                              <Link
                                key={item.type + item.id}
                                href={EVIDENCE_ROUTES[item.type] + item.id}
                                className='rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-primary/5'
                              >
                                {item.reference || item.type}
                              </Link>
                            ) : (
                              <span key={item.type + item.id} className='rounded-md border px-2 py-0.5 text-xs'>
                                {item.reference || item.type.replaceAll('_', ' ')}
                              </span>
                            )
                          )}
                          {indicator.hidden_evidence ? (
                            <span className='text-textSecondary text-xs'>+{indicator.hidden_evidence} record(s) outside your access</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}

export default ForgeAiRiskPanel
