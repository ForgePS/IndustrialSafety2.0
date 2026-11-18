'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useRouter } from 'next/navigation'
import { TbCamera, TbCameraOff, TbQrcode } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'

import { extractTokenFromQrText, scanPath } from '@/lib/forgeScanRules'

/**
 * Port slice 10: in-app QR scanner (Industrial 1.0 qr-camera-scanner). Uses the browser's own
 * BarcodeDetector with the back camera, checked about every 400 ms; no extra library. Where the browser
 * has no BarcodeDetector (iOS Safari), it says so and puts the focus on manual entry. 1.0 reported an
 * error before even trying the camera; here the camera is only reported unavailable after it fails.
 */

type DetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }

type CameraState = 'idle' | 'starting' | 'scanning' | 'unsupported' | 'denied' | 'error'

const SCAN_INTERVAL_MS = 400

const QrCameraScanner = () => {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const manualRef = useRef<HTMLInputElement | null>(null)
  const foundRef = useRef(false)

  /** Bumped by every start and stop, so a camera that opens after unmount or a restart is closed again. */
  const runRef = useRef(0)
  const [state, setState] = useState<CameraState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)

  const stop = useCallback(() => {
    runRef.current += 1
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const go = useCallback(
    (token: string) => {
      foundRef.current = true
      stop()
      router.push(scanPath(token))
    },
    [router, stop]
  )

  const start = useCallback(async () => {
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => DetectorLike }).BarcodeDetector

    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported')
      manualRef.current?.focus()

      return
    }

    stop()
    const run = runRef.current

    setState('starting')
    setMessage(null)
    foundRef.current = false

    let detector: DetectorLike

    try {
      detector = new Detector({ formats: ['qr_code'] })
    } catch {
      setState('unsupported')
      manualRef.current?.focus()

      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })

      if (run !== runRef.current) {
        stream.getTracks().forEach(track => track.stop())

        return
      }

      streamRef.current = stream

      const video = videoRef.current

      if (!video) {
        stop()

        return
      }

      video.srcObject = stream
      await video.play()
      if (run !== runRef.current) return
      setState('scanning')

      let busy = false

      timerRef.current = window.setInterval(async () => {
        if (busy || foundRef.current || !videoRef.current || videoRef.current.readyState < 2) return
        busy = true

        try {
          const codes = await detector.detect(videoRef.current)

          for (const code of codes) {
            const token = extractTokenFromQrText(code.rawValue)

            if (token) {
              go(token)

              return
            }
          }

          if (codes.length) setMessage('That QR code is not a Forge equipment code.')
        } catch {
          // A frame that cannot be read is skipped.
        } finally {
          busy = false
        }
      }, SCAN_INTERVAL_MS)
    } catch (error) {
      if (run !== runRef.current) return
      stop()
      const name = (error as { name?: string })?.name

      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error')
      manualRef.current?.focus()
    }
  }, [go, stop])

  useEffect(() => {
    void start()

    return stop
  }, [start, stop])

  const submitManual = (event: React.FormEvent) => {
    event.preventDefault()
    const token = extractTokenFromQrText(manual)

    if (!token) {
      setManualError('Enter the full QR link or the 48-character code printed under the QR code.')

      return
    }

    setManualError(null)
    go(token)
  }

  const notice =
    state === 'unsupported'
      ? 'This browser cannot read QR codes with the camera (for example Safari on iPhone). Use your phone’s camera app to scan the code, or type it below.'
      : state === 'denied'
        ? 'Camera access was blocked. Allow the camera in your browser settings, or type the code below.'
        : state === 'error'
          ? 'The camera could not be started. Type the code below instead.'
          : null

  return (
    <div className='flex flex-col gap-4'>
      <div className='relative overflow-hidden rounded-lg bg-black' data-testid='qr-scanner' data-state={state}>
        <video ref={videoRef} className={'aspect-square w-full object-cover ' + (state === 'scanning' ? '' : 'hidden')} muted playsInline />
        {state === 'scanning' ? (
          <div className='pointer-events-none absolute inset-[15%] rounded-lg border-4 border-white/80' aria-hidden />
        ) : (
          <div className='flex aspect-square w-full flex-col items-center justify-center gap-3 p-6 text-center text-white'>
            {state === 'starting' || state === 'idle' ? <TbCamera className='size-12' aria-hidden /> : <TbCameraOff className='size-12' aria-hidden />}
            <p>{state === 'starting' || state === 'idle' ? 'Starting the camera...' : notice}</p>
            {state === 'denied' || state === 'error' ? (
              <Button type='button' variant='secondary' onClick={() => void start()}>
                Try the camera again
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {state === 'scanning' ? (
        <p className='text-textSecondary text-center text-sm' role='status'>
          {message || 'Point the camera at the QR code on the equipment.'}
        </p>
      ) : null}

      <form onSubmit={submitManual} className='bg-card flex flex-col gap-3 rounded-lg border p-4' data-testid='qr-manual-entry'>
        <Label htmlFor='qr-manual' className='text-base font-semibold'>
          Or type the code
        </Label>
        <Input
          id='qr-manual'
          ref={manualRef}
          className='h-12 text-base'
          autoComplete='off'
          autoCapitalize='off'
          spellCheck={false}
          placeholder='QR link or 48-character code'
          value={manual}
          onChange={event => setManual(event.target.value)}
        />
        {manualError ? (
          <div role='alert' className='border-destructive text-destructive rounded-md border p-3 text-sm'>
            {manualError}
          </div>
        ) : null}
        <Button type='submit' size='lg' disabled={!manual.trim()}>
          <TbQrcode className='size-5' aria-hidden />
          Open
        </Button>
      </form>
    </div>
  )
}

export default QrCameraScanner
