import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { permitFormOptions } from '@/app/(back)/permits/data'
import PermitForm from '@/components/permits/PermitForm'
import { loadPermit, permitRights, rightsAt } from '@/lib/forgePermitAccess'
import { isoToLocalDateTime, permitPath, permitTypeFromSlug } from '@/lib/forgePermitRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit permit' }

/** Port slice 18: edit a draft permit. */
const EditPermitPage = async ({ params }: { params: Promise<{ type: string; id: string }> }) => {
  const { type: slug, id } = await params
  const type = permitTypeFromSlug(slug)

  if (!type) notFound()

  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const rights = await permitRights(organizationId, context.user.id, context.access)
  const permit = await loadPermit(organizationId, rights, id, type)

  if (!permit) notFound()
  const here = rightsAt(rights, permit.location_id)

  if (permit.status !== 'draft' || (!here.request && !here.manage)) redirect(permitPath(type, permit.id))

  const options = await permitFormOptions(organizationId, type, here.request ? rights.request : rights.manage)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href={permitPath(type, permit.id)} className='text-primary text-sm hover:underline'>
          ← {permit.permit_number}
        </Link>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Edit {permit.permit_number}</h1>
      </div>
      <PermitForm
        type={type}
        permitId={permit.id}
        initial={{
          locationId: permit.location_id,
          spaceId: permit.space_id || '',
          assetId: permit.asset_id || '',
          contractorCompanyId: permit.contractor_company_id || '',
          title: permit.title,
          workDescription: permit.work_description,
          workArea: permit.work_area || '',
          validFrom: isoToLocalDateTime(permit.valid_from, options.timeZone),
          validUntil: isoToLocalDateTime(permit.valid_until, options.timeZone),
          details: permit.details || {}
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

export default EditPermitPage
