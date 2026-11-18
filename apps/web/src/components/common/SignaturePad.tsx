'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@repo/ui/components/ui/button'

/**
 * Draw-to-sign pad (mouse, pen or touch). Reports a transparent PNG data URL after each stroke, or null when
 * cleared. Reusable: nothing here is specific to a form.
 */
const SignaturePad = ({
  onChange,
  disabled = false,
  label = 'Signature',
  height = 160
}: {
  onChange: (dataUrl: string | null) => void
  disabled?: boolean
  label?: string
  height?: number
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  // Match the canvas buffer to its displayed size and the screen's pixel density, so strokes stay sharp.
  const resize = useCallback(() => {
    const canvas = canvasRef.current

    if (!canvas) return

    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const { width } = canvas.getBoundingClientRect()

    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)

    const context = canvas.getContext('2d')

    if (context) {
      context.scale(ratio, ratio)
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = 2.2
      context.strokeStyle = '#0f1f61'
    }

    setEmpty(true)
    onChange(null)
  }, [height, onChange])

  useEffect(() => {
    resize()

    // Resizing clears the drawing, so it only happens on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()

    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    last.current = point(event)

    // A tap leaves a dot.
    const context = event.currentTarget.getContext('2d')

    if (context && last.current) {
      context.beginPath()
      context.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2)
      context.fillStyle = '#0f1f61'
      context.fill()
    }
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return

    event.preventDefault()

    const context = event.currentTarget.getContext('2d')
    const next = point(event)

    if (context && last.current) {
      context.beginPath()
      context.moveTo(last.current.x, last.current.y)
      context.lineTo(next.x, next.y)
      context.stroke()
    }

    last.current = next
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return

    drawing.current = false
    last.current = null
    setEmpty(false)
    onChange(event.currentTarget.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (canvas && context) {
      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.restore()
    }

    setEmpty(true)
    onChange(null)
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-3'>
        <span className='text-sm font-medium'>{label}</span>
        <Button type='button' size='sm' variant='outline' onClick={clear} disabled={disabled || empty}>Clear</Button>
      </div>
      <canvas
        ref={canvasRef}
        role='img'
        aria-label={`${label} pad. Draw your signature with a mouse, pen or finger.`}
        data-testid='signature-pad'
        className='w-full touch-none rounded-md border border-dashed bg-white'
        style={{ height }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <p className='text-textSecondary text-xs'>{empty ? 'Sign above.' : 'Signed. Clear to redo.'}</p>
    </div>
  )
}

export default SignaturePad
