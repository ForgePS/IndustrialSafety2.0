'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TbBuilding } from 'react-icons/tb'
import { toast } from '@repo/ui/utils/toast'
import { setActiveOrganization } from '@/app/(back)/actions/tenantContext'

type Organization = {
  id: string
  name: string
  slug: string
  membershipRole: string
}

const TenantSwitcher = ({
  organizations,
  activeOrganizationId
}: {
  organizations: Organization[]
  activeOrganizationId?: string | null
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (!organizations.length) return null

  if (organizations.length === 1) {
    return (
      <div className='border-input text-textSecondary hidden items-center gap-2 rounded-md border px-3 py-2 text-sm md:flex'>
        <TbBuilding />
        <span className='max-w-52 truncate'>{organizations[0].name}</span>
      </div>
    )
  }

  return (
    <div className='hidden items-center gap-2 md:flex'>
      <TbBuilding className='text-textSecondary' />
      <select
        value={activeOrganizationId || organizations[0].id}
        disabled={pending}
        onChange={event => {
          const organizationId = event.target.value
          startTransition(async () => {
            const result = await setActiveOrganization(organizationId)
            if ('error' in result) {
              toast('error', result.error || 'Unable to change company.')
              return
            }
            router.refresh()
          })
        }}
        className='border-input bg-card text-textSecondary h-[38px] max-w-64 rounded-md border px-3'
        aria-label='Active company'
      >
        {organizations.map(organization => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export default TenantSwitcher
