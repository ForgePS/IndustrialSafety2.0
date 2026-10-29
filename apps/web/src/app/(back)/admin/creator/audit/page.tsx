// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

export const metadata: Metadata = { title: 'Audit & Security' }

const Page = () => {
  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Audit & Security</h1>
        <p className='text-textSecondary mt-2 max-w-3xl'>Review Creator changes, sensitive actions, security events and immutable platform audit history.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Foundation active</CardTitle>
          <CardDescription>This section is now part of the Creator control-plane build.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-textSecondary text-sm'>
            Database structures for this area are being introduced first so the UI can be built against stable multi-tenant rules rather than hard-coded demo data.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default Page
