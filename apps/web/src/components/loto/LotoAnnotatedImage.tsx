'use client'

import { useState } from 'react'

import { LOTO_ARROW_COLOR, lotoArrowHead, normalizeLotoArrows, type LotoArrow } from '@/lib/forgeLotoRules'

/**
 * A LOTO photo with its arrows drawn on top. The SVG takes the photo's own size once it loads,
 * so arrow heads keep their shape on screen, in print and on the public QR page.
 */
const LotoAnnotatedImage = ({
  src,
  alt,
  annotations,
  selectedId,
  className,
  imgClassName
}: {
  src: string
  alt: string
  annotations: unknown
  selectedId?: string | null
  className?: string
  imgClassName?: string
}) => {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const arrows: LotoArrow[] = normalizeLotoArrows(annotations)
  const w = size?.w || 1000
  const h = size?.h || 1000
  const aspect = w / h

  return (
    <div className={'relative inline-block max-w-full ' + (className || '')}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, not static assets */}
      <img
        src={src}
        alt={alt}
        className={'block max-w-full ' + (imgClassName || '')}
        onLoad={event => setSize({ w: event.currentTarget.naturalWidth || 1000, h: event.currentTarget.naturalHeight || 1000 })}
      />
      {arrows.length ? (
        <svg className='pointer-events-none absolute inset-0 h-full w-full' viewBox={`0 0 ${w} ${h}`} preserveAspectRatio='none' aria-hidden='true'>
          {arrows.map(arrow => {
            const color = arrow.id === selectedId ? '#2563eb' : LOTO_ARROW_COLOR
            const head = lotoArrowHead(arrow, aspect).map(([x, y]) => `${x * w},${y * h}`).join(' ')
            const stroke = Math.max(w, h) * 0.008

            return (
              <g key={arrow.id}>
                <line x1={arrow.x1 * w} y1={arrow.y1 * h} x2={arrow.x2 * w} y2={arrow.y2 * h} stroke='#ffffff' strokeWidth={stroke * 2} strokeLinecap='round' />
                <polygon points={head} fill='#ffffff' stroke='#ffffff' strokeWidth={stroke * 1.5} strokeLinejoin='round' />
                <line x1={arrow.x1 * w} y1={arrow.y1 * h} x2={arrow.x2 * w} y2={arrow.y2 * h} stroke={color} strokeWidth={stroke} strokeLinecap='round' />
                <polygon points={head} fill={color} />
              </g>
            )
          })}
        </svg>
      ) : null}
    </div>
  )
}

export default LotoAnnotatedImage
