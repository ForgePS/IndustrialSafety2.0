import type { Metadata } from 'next'

import QrCameraScanner from '@/components/scan/QrCameraScanner'

export const metadata: Metadata = { title: 'Scan a QR Code', robots: { index: false, follow: false } }

/**
 * Port slice 10: in-app QR scanner. Public: works signed in or not; the scan menu decides what the
 * person can do once the code is read.
 */
const ScanPage = () => (
  <main className='bg-background min-h-screen px-4 py-6'>
    <div className='mx-auto flex w-full max-w-xl flex-col gap-4'>
      <div>
        <h1 className='text-textPrimary text-2xl font-extrabold'>Scan a QR code</h1>
        <p className='text-textSecondary text-sm'>Point your camera at the Forge QR code on the equipment, location or form.</p>
      </div>
      <QrCameraScanner />
    </div>
  </main>
)

export default ScanPage
