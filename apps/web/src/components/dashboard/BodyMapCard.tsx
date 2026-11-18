'use client'

/**
 * Injury body map dashboard card (port of 1.0 components/incident-body-map.tsx + incidents-body-map-panel.tsx).
 *
 * Props:
 * - data: BodyMapCardData from getBodyMapCardData (src/lib/forgeBodyMap.ts): the viewer's visible sources and a
 *   summary per period ('6m' | '12m' | 'all'). When the loader returns null the viewer can see no source: render
 *   nothing.
 * - initialPeriod (optional): starting period, e.g. parseBodyMapPeriod(searchParams.bodyMap). Defaults to '12m'.
 *   Switching period is client state; the card also writes ?bodyMap= into the URL (replaceState) so a reload that
 *   passes initialPeriod keeps the choice.
 * - title (optional): card title, defaults to "Injury locations".
 *
 * Usage (server component):
 *   const bodyMap = await getBodyMapCardData({ organizationId, userId, access })
 *   {bodyMap ? <BodyMapCard data={bodyMap} initialPeriod={parseBodyMapPeriod(searchParams.bodyMap)} /> : null}
 *
 * Clicking a region marker or a body part in the list filters the recent-injury list to that part.
 */

import { useMemo, useState } from 'react'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import type { BodyMapCardData } from '@/lib/forgeBodyMap'
import {
  BODY_MAP_IMAGE,
  BODY_MAP_PERIODS,
  BODY_MAP_SOURCE_LABELS,
  BODY_REGIONS,
  BODY_VIEWS,
  bodyLocationSummaryLabel,
  heatTone,
  regionById,
  regionsForView,
  type BodyMapPeriod,
  type HeatTone
} from '@/lib/forgeBodyMapRules'

const TONE_CLASSES: Record<HeatTone, string> = {
  info: 'bg-sky-500/85 text-white ring-sky-200',
  warning: 'bg-amber-500/90 text-white ring-amber-200',
  danger: 'bg-red-600/90 text-white ring-red-200'
}

const HEAT_LEGEND: ReadonlyArray<{ tone: HeatTone; label: string }> = [
  { tone: 'info', label: 'Lower' },
  { tone: 'warning', label: 'Moderate' },
  { tone: 'danger', label: 'Higher' }
]

const RECENT_SHOWN = 8

const plural = (count: number) => `${count} injur${count === 1 ? 'y' : 'ies'}`

const formatDate = (date: string) => {
  const parsed = new Date(date + 'T00:00:00')

  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const BodyMapCard = ({ data, initialPeriod = '12m', title = 'Injury locations' }: { data: BodyMapCardData; initialPeriod?: BodyMapPeriod; title?: string }) => {
  const [period, setPeriod] = useState<BodyMapPeriod>(initialPeriod)

  /** Focused body part label (front and back regions with the same label). */
  const [focusPart, setFocusPart] = useState<string | null>(null)

  const summary = data.periods[period]
  const periodLabel = BODY_MAP_PERIODS.find(item => item.value === period)?.label || ''

  const recent = useMemo(() => {
    if (!focusPart) return summary.recent

    return summary.recent.filter(injury => injury.bodyLocations.some(id => regionById(id)?.part === focusPart))
  }, [summary, focusPart])

  const choosePeriod = (next: BodyMapPeriod) => {
    setPeriod(next)
    setFocusPart(null)

    try {
      const url = new URL(window.location.href)

      url.searchParams.set('bodyMap', next)
      window.history.replaceState(window.history.state, '', url)
    } catch {
      /* URL sync is a convenience only */
    }
  }

  const toggleFocus = (part: string) => setFocusPart(current => (current === part ? null : part))

  const sourceText = data.sources.map(source => BODY_MAP_SOURCE_LABELS[source]).join(', ')

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3 space-y-0'>
        <div className='min-w-0'>
          <CardTitle>{title}</CardTitle>
          <CardDescription className='mt-1'>
            {summary.total ? `${plural(summary.total)} with a recorded body part` : 'No recorded body parts'} · {periodLabel}
            <span className='block text-xs'>From {sourceText} records you can see</span>
          </CardDescription>
        </div>
        <div className='bg-muted inline-flex rounded-md p-0.5' role='group' aria-label='Body map period'>
          {BODY_MAP_PERIODS.map(item => (
            <button
              key={item.value}
              type='button'
              aria-pressed={period === item.value}
              onClick={() => choosePeriod(item.value)}
              className={
                'rounded px-2.5 py-1 text-xs font-semibold transition-colors ' +
                (period === item.value ? 'bg-card text-primary shadow-sm' : 'text-textSecondary hover:text-textPrimary')
              }
            >
              {item.value === 'all' ? 'All' : item.value === '6m' ? '6 months' : '12 months'}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        <div className='grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'>
          <div>
            <div className='mx-auto grid max-w-md grid-cols-2 gap-2'>
              {BODY_VIEWS.map(view => (
                <figure key={view.id} className='m-0'>
                  <figcaption className='text-textSecondary mb-1 text-center text-xs font-semibold uppercase tracking-wide'>{view.label}</figcaption>
                  <div
                    className='relative w-full'
                    style={{
                      aspectRatio: '288 / 433',
                      backgroundImage: `url(${BODY_MAP_IMAGE})`,
                      backgroundSize: '200% 100%',
                      backgroundPosition: view.id === 'front' ? '0 0' : '100% 0',
                      backgroundRepeat: 'no-repeat'
                    }}
                    role='group'
                    aria-label={`Worker ${view.id} view`}
                  >
                    {regionsForView(view.id).map(region => {
                      const count = summary.counts[region.id] || 0
                      const tone = heatTone(count, summary.maxCount)

                      if (!tone) return null

                      const size = 1.5 + (summary.maxCount ? count / summary.maxCount : 0) * 1.1
                      const active = focusPart === region.part

                      return (
                        <button
                          key={region.id}
                          type='button'
                          onClick={() => toggleFocus(region.part)}
                          aria-pressed={active}
                          aria-label={`${region.part} (${view.label.toLowerCase()}): ${plural(count)}`}
                          title={`${region.part}: ${plural(count)}`}
                          className={
                            'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold shadow ring-2 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
                            TONE_CLASSES[tone] +
                            (active ? ' scale-110 outline outline-2 outline-offset-2 outline-primary' : '')
                          }
                          style={{
                            left: `${region.left + region.width / 2}%`,
                            top: `${region.top + region.height / 2}%`,
                            width: `${size}rem`,
                            height: `${size}rem`
                          }}
                        >
                          {count}
                        </button>
                      )
                    })}
                  </div>
                </figure>
              ))}
            </div>

            {summary.total ? (
              <div className='text-textSecondary mt-3 flex flex-wrap items-center justify-center gap-3 text-xs'>
                {HEAT_LEGEND.map(entry => (
                  <span key={entry.tone} className='inline-flex items-center gap-1.5'>
                    <span className={'inline-block size-3 rounded-full ' + TONE_CLASSES[entry.tone]} aria-hidden='true' />
                    {entry.label}
                  </span>
                ))}
                <span>Select a marker to filter the list</span>
              </div>
            ) : (
              <p className='text-textSecondary mt-3 text-center text-sm'>No injury body parts recorded for this period.</p>
            )}
          </div>

          <div className='flex min-w-0 flex-col gap-5'>
            {summary.parts.length ? (
              <section aria-labelledby='bodymap-parts-heading'>
                <h3 id='bodymap-parts-heading' className='text-textPrimary mb-2 text-sm font-semibold'>
                  Most affected body parts
                </h3>
                <ul className='divide-y'>
                  {summary.parts.map(entry => {
                    const active = focusPart === entry.part

                    return (
                      <li key={entry.part}>
                        <button
                          type='button'
                          onClick={() => toggleFocus(entry.part)}
                          aria-pressed={active}
                          aria-label={`${entry.part}: ${plural(entry.count)}`}
                          className={
                            'flex w-full items-center justify-between gap-2 py-1.5 text-left text-sm hover:text-primary ' +
                            (active ? 'text-primary font-semibold' : 'text-textPrimary')
                          }
                        >
                          <span className='truncate'>{entry.part}</span>
                          <span className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold'>{entry.count}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby='bodymap-recent-heading'>
              <div className='mb-2 flex items-center justify-between gap-2'>
                <h3 id='bodymap-recent-heading' className='text-textPrimary text-sm font-semibold'>
                  {focusPart ? `Recent: ${focusPart}` : 'Recent injuries'}
                </h3>
                {focusPart ? (
                  <button type='button' className='text-primary text-xs font-semibold' onClick={() => setFocusPart(null)}>
                    Show all
                  </button>
                ) : null}
              </div>
              {recent.length ? (
                <ul className='divide-y'>
                  {recent.slice(0, RECENT_SHOWN).map(injury => (
                    <li key={injury.id} className='py-1.5'>
                      <Link href={injury.href} className='text-primary text-sm font-semibold hover:underline'>
                        {injury.label}
                      </Link>
                      <span className='text-textSecondary block text-xs'>
                        {formatDate(injury.date)} · {bodyLocationSummaryLabel(injury.bodyLocations, BODY_REGIONS)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-textSecondary text-sm'>No matching injuries for this period.</p>
              )}
            </section>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default BodyMapCard
