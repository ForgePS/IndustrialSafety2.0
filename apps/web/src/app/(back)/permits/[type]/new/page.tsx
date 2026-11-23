import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { permitFormOptions } from '@/app/(back)/permits/data'
import PermitForm from '@/components/permits/PermitForm'
import { permitRights } from '@/lib/forgePermitAccess'
import { PERMIT_TYPE_INFO, permitPath, permitTypeFromSlug } from '@/lib/forgePermitRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'New permit' }

/** Port slice 18: start a draft permit. */
const NewPermitPage = async ({ params }: { params: Promise<{ type: string }> }) => {
  const { type: slug } = await params
  const type = permitTypeFromSlug(slug)

  if (!type) notFound()

  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const rights = await permitRights(organizationId, context.user.id, context.access)

  if (!rights.request) redirect(permitPath(type))

  const options = await permitFormOptions(organizationId, type, rights.request)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href={permitPath(type)} className='text-primary text-sm hover:underline'>
          ← {PERMIT_TYPE_INFO[type].label}
        </Link>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>New {PERMIT_TYPE_INFO[type].label.toLowerCase()} permit</h1>
        <p className='text-textSecondary mt-2'>Save it as a draft, add the people and checklist, then submit it for approval.</p>
      </div>
      <PermitForm
        type={type}
        initial={{
          locationId: options.locations.length === 1 ? options.locations[0].id : '',
          spaceId: '',
          assetId: '',
          contractorCompanyId: '',
          title: '',
          workDescription: '',
          workArea: '',
          validFrom: options.defaultFrom,
          validUntil: options.defaultUntil,
          details: type === 'hot_work' ? { gas_test_required: false } : {}
        }}
        locations={options.locations}
        spaces={options.spaces}
        assets={options.assets}
        contractors={options.contractors}
        maxHours={options.maxHours}
        zoneLabel={options.zoneLabel}
      />
    </div>
  )
}

export default NewPermitPage
