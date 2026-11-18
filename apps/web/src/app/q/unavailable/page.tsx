import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'QR Code Unavailable' }

const QrUnavailablePage = () => (
  <main className='mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16'>
    <div className='w-full rounded-xl border p-8'>
      <div className='text-sm font-semibold uppercase tracking-wide'>Forge Industrial Safety 2.0</div>
      <h1 className='mt-3 text-3xl font-bold'>QR Code Unavailable</h1>
      <p className='mt-3 text-base opacity-75'>
        This managed QR code is invalid, disabled, expired, archived, or no longer available. Contact your company administrator if you believe the code should still be active.
      </p>
    </div>
  </main>
)

export default QrUnavailablePage
