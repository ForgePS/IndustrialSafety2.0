'use client'

import { useId, useMemo, useState, type PointerEvent, type ReactNode } from 'react'

import { cn } from '@repo/ui/lib/utils'

import type { YearComparison } from '@/lib/forgeDashboardRules'

type Month = { month: string; label: string; injuries: number; other: number; total: number }

type View = '12m' | '3y' | '5y'

const VIEWS: Array<{ id: View; label: string }> = [
  { id: '12m', label: '12 months' },
  { id: '3y', label: '3 years' },
  { id: '5y', label: '5 years' }
]

const WIDTH = 640
const HEIGHT = 220
const PAD = { top: 18, right: 14, bottom: 30, left: 14 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom
const BASELINE = PAD.top + PLOT_H
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * One color per year, newest first: the first five categorical slots of the dataviz reference palette, in their
 * fixed order, stepped separately for the dark surface. Validated on this app's card surfaces (#ffffff, #292433):
 * every hard check passes in both modes. Three light steps sit under 3:1, so the legend table below the chart
 * always labels each year with its numbers.
 */
const YEAR_COLORS = ['var(--year-1)', 'var(--year-2)', 'var(--year-3)', 'var(--year-4)', 'var(--year-5)']

const YEAR_COLOR_VARS =
  '[--year-1:#2a78d6] [--year-2:#eb6834] [--year-3:#1baf7a] [--year-4:#eda100] [--year-5:#e87ba4] ' +
  'dark:[--year-1:#3987e5] dark:[--year-2:#d95926] dark:[--year-3:#199e70] dark:[--year-4:#c98500] dark:[--year-5:#d55181]'

/** Catmull-Rom to Bézier (1.0 smoothLinePath). Control points are clamped to the plot so a wave never dips below zero. */
const smoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  const clamp = (y: number) => Math.min(BASELINE, Math.max(PAD.top, y))
  let d = `M ${points[0].x} ${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2

    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${clamp(p1.y + (p2.y - p0.y) / 6)}, ${p2.x - (p3.x - p1.x) / 6} ${clamp(p2.y - (p3.y - p1.y) / 6)}, ${p2.x} ${p2.y}`
  }

  return d
}

const xAt = (index: number, count: number) => (count === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (index / (count - 1)) * PLOT_W)

/** Rounds the top of the scale so the four gridlines land on whole numbers. */
const niceTop = (max: number) => (max <= 4 ? 4 : Math.ceil(max / 4) * 4)

const nearest = (event: PointerEvent<SVGSVGElement>, xs: number[]) => {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * WIDTH
  let best = 0

  xs.forEach((value, index) => {
    if (Math.abs(value - x) < Math.abs(xs[best] - x)) best = index
  })

  return best
}

const Grid = ({ top }: { top: number }) => (
  <>
    {[0.25, 0.5, 0.75, 1].map(step => {
      const y = PAD.top + PLOT_H * (1 - step)

      return (
        <g key={step}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} className='stroke-current opacity-15' strokeDasharray='4 4' />
          <text x={WIDTH - PAD.right} y={y - 4} textAnchor='end' className='fill-current text-[10px] opacity-50'>
            {Math.round(top * step)}
          </text>
        </g>
      )
    })}
    <line x1={PAD.left} x2={WIDTH - PAD.right} y1={BASELINE} y2={BASELINE} className='stroke-current opacity-25' />
  </>
)

const Tooltip = ({ x, y, title, children }: { x: number; y: number; title: string; children: ReactNode }) => (
  <div
    role='tooltip'
    data-testid='incident-trend-tooltip'
    className='bg-card border-border pointer-events-none absolute z-10 min-w-36 rounded-md border px-3 py-2 text-xs shadow-md'
    style={{ left: `${(x / WIDTH) * 100}%`, top: `${(y / HEIGHT) * 100}%`, transform: 'translate(-50%, calc(-100% - 0.75rem))' }}
  >
    <div className='border-border mb-1 border-b pb-1 font-semibold'>{title}</div>
    {children}
  </div>
)

/** The last 12 months as 1.0's smooth area (wave), with a hover crosshair. */
const MonthsWave = ({ months }: { months: Month[] }) => {
  const gradientId = 'trend-' + useId().replace(/:/g, '')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const top = niceTop(Math.max(...months.map(month => month.total)))

  const coords = useMemo(
    () => months.map((month, index) => ({ ...month, x: xAt(index, months.length), y: BASELINE - (month.total / top) * PLOT_H })),
    [months, top]
  )

  const line = smoothPath(coords)
  const area = coords.length ? `${line} L ${coords[coords.length - 1].x} ${BASELINE} L ${coords[0].x} ${BASELINE} Z` : ''
  const active = activeIndex === null ? null : coords[activeIndex]
  const last = coords[coords.length - 1]

  return (
    <div className='relative w-full'>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className='block h-auto min-h-48 w-full cursor-crosshair touch-none'
        role='img'
        aria-label={`Incidents per month: ${months.map(month => `${month.label} ${month.total}`).join(', ')}`}
        onPointerMove={event => setActiveIndex(nearest(event, coords.map(point => point.x)))}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor='hsl(var(--primary))' stopOpacity='0.35' />
            <stop offset='100%' stopColor='hsl(var(--primary))' stopOpacity='0.02' />
          </linearGradient>
        </defs>
        <Grid top={top} />
        <path d={area} fill={`url(#${gradientId})`} data-trend-area />
        <path d={line} fill='none' stroke='hsl(var(--primary))' strokeWidth={2.5} strokeLinecap='round' strokeLinejoin='round' data-trend-line />
        {active ? <line x1={active.x} x2={active.x} y1={PAD.top} y2={BASELINE} className='pointer-events-none stroke-current opacity-35' strokeDasharray='4 4' /> : null}
        {last && last !== active ? <circle cx={last.x} cy={last.y} r={4} className='fill-card' stroke='hsl(var(--primary))' strokeWidth={2.5} /> : null}
        {active ? <circle cx={active.x} cy={active.y} r={5} fill='hsl(var(--primary))' className='stroke-card' strokeWidth={2} /> : null}
        {coords.map(point => (
          <text
            key={point.month}
            x={point.x}
            y={HEIGHT - 8}
            textAnchor='middle'
            className={cn('fill-current text-[11px]', active?.month === point.month ? 'font-semibold' : 'opacity-60')}
          >
            {point.label}
          </text>
        ))}
      </svg>
      {active ? (
        <Tooltip x={active.x} y={active.y} title={new Date(active.month + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}>
          <div className='flex items-center gap-2'>
            <span className='size-2 rounded-full' style={{ background: 'hsl(var(--primary))' }} aria-hidden />
            Incidents <strong className='ml-auto'>{active.total}</strong>
          </div>
          <div className='text-textSecondary flex gap-2 pl-4'>
            Injuries <span className='ml-auto'>{active.injuries}</span>
          </div>
          <div className='text-textSecondary flex gap-2 pl-4'>
            Other <span className='ml-auto'>{active.other}</span>
          </div>
        </Tooltip>
      ) : null}
    </div>
  )
}

/** Years overlaid January to December, one wave line per year, newest drawn last and thickest. */
const YearsWave = ({ years, currentMonth }: { years: YearComparison[]; currentMonth: number }) => {
  const [activeMonth, setActiveMonth] = useState<number | null>(null)
  const top = niceTop(Math.max(0, ...years.flatMap(year => year.months.map(value => value || 0))))
  const xs = MONTHS.map((_, index) => xAt(index, 12))
  const yAt = (value: number) => BASELINE - (value / top) * PLOT_H

  const series = years.map((year, index) => {
    const points = year.months.flatMap((value, month) => (value === null ? [] : [{ x: xs[month], y: yAt(value) }]))

    return { ...year, color: YEAR_COLORS[index], current: index === 0, points, path: smoothPath(points) }
  })

  // Oldest first, so the current year sits on top.
  const drawOrder = [...series].reverse()
  const tooltipY = activeMonth === null ? 0 : Math.min(...series.map(year => (year.months[activeMonth] === null ? BASELINE : yAt(year.months[activeMonth] || 0))))

  return (
    <div className='w-full'>
      {/* Only the chart is the tooltip's positioning box; the legend table sits outside it. */}
      <div className='relative'>
        <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className='block h-auto min-h-48 w-full cursor-crosshair touch-none'
        role='img'
        aria-label={`Incidents per month by year: ${series.map(year => `${year.year} ${year.total}`).join(', ')}`}
        onPointerMove={event => setActiveMonth(nearest(event, xs))}
        onPointerLeave={() => setActiveMonth(null)}
      >
        <Grid top={top} />
        {activeMonth !== null ? (
          <line x1={xs[activeMonth]} x2={xs[activeMonth]} y1={PAD.top} y2={BASELINE} className='pointer-events-none stroke-current opacity-35' strokeDasharray='4 4' />
        ) : null}
        {drawOrder.map(year => (
          <g key={year.year} data-trend-year={year.year}>
            {/* A ring in the card color keeps crossing lines apart. */}
            <path d={year.path} fill='none' className='stroke-card' strokeWidth={year.current ? 6 : 5} strokeLinecap='round' strokeLinejoin='round' />
            <path d={year.path} fill='none' stroke={year.color} strokeWidth={year.current ? 3 : 2} strokeLinecap='round' strokeLinejoin='round' />
          </g>
        ))}
        {activeMonth !== null
          ? drawOrder.map(year =>
              year.months[activeMonth] === null ? null : (
                <circle key={year.year} cx={xs[activeMonth]} cy={yAt(year.months[activeMonth] || 0)} r={4.5} fill={year.color} className='stroke-card' strokeWidth={2} />
              )
            )
          : null}
        {MONTHS.map((label, index) => (
          <text key={label} x={xs[index]} y={HEIGHT - 8} textAnchor='middle' className={cn('fill-current text-[11px]', activeMonth === index ? 'font-semibold' : 'opacity-60')}>
            {label}
          </text>
        ))}
      </svg>

      {activeMonth !== null ? (
        <Tooltip x={xs[activeMonth]} y={tooltipY} title={new Date(Date.UTC(2000, activeMonth, 15)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}>
          {series.map(year => (
            <div key={year.year} className='flex items-center gap-2'>
              <span className='size-2 rounded-full' style={{ background: year.color }} aria-hidden />
              <span className={year.current ? 'font-semibold' : undefined}>{year.year}</span>
              <span className='ml-auto font-semibold'>{year.months[activeMonth] === null ? '—' : year.months[activeMonth]}</span>
            </div>
          ))}
        </Tooltip>
      ) : null}
      </div>

      <table className='mt-3 w-full text-sm' data-testid='incident-trend-years'>
        <thead>
          <tr className='text-textSecondary text-left text-xs'>
            <th className='py-1 font-medium'>Year</th>
            <th className='py-1 text-right font-medium'>Jan–{MONTHS[currentMonth - 1]}</th>
            <th className='py-1 text-right font-medium'>Full year</th>
          </tr>
        </thead>
        <tbody className='divide-border divide-y'>
          {series.map(year => (
            <tr key={year.year} data-trend-year-row={year.year}>
              <td className='py-1.5'>
                <span className='flex items-center gap-2'>
                  <span className={cn('inline-block w-4 rounded-full', year.current ? 'h-[3px]' : 'h-0.5')} style={{ background: year.color }} aria-hidden />
                  <span className={year.current ? 'font-semibold' : undefined}>{year.year}</span>
                </span>
              </td>
              <td className='py-1.5 text-right'>{year.samePeriod}</td>
              <td className='py-1.5 text-right'>{year.current ? <span className='text-textSecondary'>{year.total} so far</span> : year.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Incident Trend: 1.0's 12-month wave, plus this year compared with the last 3 or 5 years. */
const IncidentTrendChart = ({ months, years, currentMonth }: { months: Month[]; years: YearComparison[] | null; currentMonth: number }) => {
  const [view, setView] = useState<View>('12m')
  const shown = view === '3y' ? (years || []).slice(0, 3) : (years || []).slice(0, 5)

  return (
    <div className={cn('flex flex-col gap-3', YEAR_COLOR_VARS)} data-testid='incident-trend-chart' data-view={view}>
      {years ? (
        <div className='border-border flex self-start rounded-md border p-0.5 text-xs' role='group' aria-label='Incident trend period'>
          {VIEWS.map(item => (
            <button
              key={item.id}
              type='button'
              aria-pressed={item.id === view}
              className={cn('rounded px-2 py-1', item.id === view ? 'bg-primary text-primary-foreground' : 'text-textSecondary')}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {view === '12m' || !years ? <MonthsWave months={months} /> : <YearsWave years={shown} currentMonth={currentMonth} />}
    </div>
  )
}

export default IncidentTrendChart
