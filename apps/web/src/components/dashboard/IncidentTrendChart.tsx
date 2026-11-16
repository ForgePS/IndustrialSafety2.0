'use client'

import { useId, useMemo, useState, type PointerEvent } from 'react'

type Month = { month: string; label: string; injuries: number; other: number; total: number }

const WIDTH = 640
const HEIGHT = 220
const PAD = { top: 18, right: 14, bottom: 30, left: 14 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom

/** Catmull-Rom to Bézier (1.0 smoothLinePath). Control points are clamped to the plot so the wave never dips below zero. */
const smoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  const floor = PAD.top + PLOT_H
  const clamp = (y: number) => Math.min(floor, Math.max(PAD.top, y))
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

/** 1.0's incident trend: a smooth area ("wave") of incidents per month, with a hover crosshair and tooltip. */
const IncidentTrendChart = ({ months }: { months: Month[] }) => {
  const gradientId = 'trend-' + useId().replace(/:/g, '')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const max = Math.max(1, ...months.map(month => month.total))

  // Round the top of the scale so the gridlines land on whole numbers.
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4

  const coords = useMemo(
    () =>
      months.map((month, index) => ({
        ...month,
        x: months.length === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (index / (months.length - 1)) * PLOT_W,
        y: PAD.top + PLOT_H - (month.total / top) * PLOT_H
      })),
    [months, top]
  )

  const line = smoothPath(coords)
  const baseline = PAD.top + PLOT_H
  const area = coords.length ? `${line} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z` : ''
  const grid = [0.25, 0.5, 0.75, 1].map(step => ({ y: PAD.top + PLOT_H * (1 - step), value: Math.round(top * step) }))
  const active = activeIndex === null ? null : coords[activeIndex]
  const last = coords[coords.length - 1]

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH
    let best = 0

    coords.forEach((point, index) => {
      if (Math.abs(point.x - x) < Math.abs(coords[best].x - x)) best = index
    })
    setActiveIndex(best)
  }

  return (
    <div className='relative w-full' data-testid='incident-trend-chart'>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className='block h-auto min-h-48 w-full cursor-crosshair touch-none'
        role='img'
        aria-label={`Incidents per month: ${months.map(month => `${month.label} ${month.total}`).join(', ')}`}
        onPointerMove={onMove}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor='hsl(var(--primary))' stopOpacity='0.35' />
            <stop offset='100%' stopColor='hsl(var(--primary))' stopOpacity='0.02' />
          </linearGradient>
        </defs>

        {grid.map(row => (
          <g key={row.y}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={row.y} y2={row.y} className='stroke-current opacity-15' strokeDasharray='4 4' />
            <text x={WIDTH - PAD.right} y={row.y - 4} textAnchor='end' className='fill-current text-[10px] opacity-50'>
              {row.value}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={baseline} y2={baseline} className='stroke-current opacity-25' />

        <path d={area} fill={`url(#${gradientId})`} data-trend-area />
        <path d={line} fill='none' stroke='hsl(var(--primary))' strokeWidth={2.5} strokeLinecap='round' strokeLinejoin='round' data-trend-line />

        {active ? <line x1={active.x} x2={active.x} y1={PAD.top} y2={baseline} className='pointer-events-none stroke-current opacity-35' strokeDasharray='4 4' /> : null}

        {last && last !== active ? <circle cx={last.x} cy={last.y} r={4} className='fill-card' stroke='hsl(var(--primary))' strokeWidth={2.5} /> : null}
        {active ? <circle cx={active.x} cy={active.y} r={5} fill='hsl(var(--primary))' className='stroke-card' strokeWidth={2} /> : null}

        {coords.map(point => (
          <text
            key={point.month}
            x={point.x}
            y={HEIGHT - 8}
            textAnchor='middle'
            className={active?.month === point.month ? 'fill-current text-[11px] font-semibold' : 'fill-current text-[11px] opacity-60'}
          >
            {point.label}
          </text>
        ))}
      </svg>

      {active ? (
        <div
          role='tooltip'
          data-testid='incident-trend-tooltip'
          className='bg-card border-border pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-md border px-3 py-2 text-xs shadow-md'
          style={{ left: `${(active.x / WIDTH) * 100}%`, top: `${(active.y / HEIGHT) * 100}%`, transform: 'translate(-50%, calc(-100% - 0.75rem))' }}
        >
          <div className='border-border mb-1 border-b pb-1 font-semibold'>{new Date(active.month + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
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
        </div>
      ) : null}
    </div>
  )
}

export default IncidentTrendChart
