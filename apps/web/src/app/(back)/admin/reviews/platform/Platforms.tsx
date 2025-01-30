'use client'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit } from 'react-icons/tb'
import type { ColumnDef } from '@tanstack/react-table'
import { Card } from '@repo/ui/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { Button } from '@repo/ui/components/ui/button'
import DataTable from '@repo/ui/components/ui/data-table'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import { getInitials } from '@repo/ui/utils/getInitials'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Database } from '@repo/supabase/types'

// Delete a platform
export const deletePlatform = async (platformId: number, t: TFunction) => {
  const supabase = createClient()

  try {
    const { error } = await supabase.from('review_platforms').delete().eq('id', platformId)

    if (error) {
      console.error('Error deleting platform: ', error.message)
      toast('error', t('admin:reviewPlatformsDeleteError', { message: error.message }))
    } else {
      toast('success', t('admin:reviewPlatformsDeleteSuccess'))
    }
  } catch (error: any) {
    console.error('Error deleting platform: ', error)
    toast('error', t('admin:reviewPlatformsDeleteError', { message: error.message }))

    return false
  }
}

const Platforms = ({ platformData }: { platformData: Database['public']['Tables']['review_platforms']['Row'][] }) => {
  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  const columns: ColumnDef<Database['public']['Tables']['review_platforms']['Row']>[] = [
    {
      accessorKey: 'logo',
      header: () => <Trans i18nKey='admin:reviewPlatformsLogoColumn' />,
      cell: ({ row }) => {
        const platform_name = row.getValue('platform_name') as string
        const logoSrc = row.getValue('logo') as string

        return (
          <Avatar shape='circle' size='lg' className={`${logoSrc ? 'bg-transparent' : ''}`}>
            <AvatarImage src={row.getValue('logo') as string} alt={`${platform_name} logo`} />
            <AvatarFallback>{getInitials(platform_name)}</AvatarFallback>
          </Avatar>
        )
      }
    },
    {
      accessorKey: 'platform_name',
      header: () => <Trans i18nKey='admin:platformNameLabel' />,
      cell: ({ row }) => <div className='capitalize'>{row.getValue('platform_name')}</div>
    },
    {
      accessorKey: 'slug',
      header: () => <Trans i18nKey='admin:reviewPlatformsSlugColumn' />,
      cell: ({ row }) => <div>{row.getValue('slug')}</div>
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className='flex items-center gap-4'>
          <Link
            href={`/admin/reviews/platform/${row.original.id}/edit`}
            className='text-primary flex items-center gap-1'
          >
            <TbEdit />
            <Trans i18nKey='admin:editButton' />
          </Link>
          <DeleteDialog
            variant='ghostDestructive'
            handleDelete={async () => {
              await deletePlatform(row.original.id, t)
              router.refresh()
            }}
            itemName='platform'
          />
        </div>
      )
    }
  ]

  return (
    <div className='grid grid-cols-1 gap-y-8'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <h1 className='text-textPrimary text-3xl font-bold'>
          <Trans i18nKey='admin:reviewPlatformsTitle' />
        </h1>
        <Link href='/admin/reviews/platform/create'>
          <Button className='max-sm:is-full'>
            <Trans i18nKey='admin:reviewPlatformsNewButton' />
          </Button>
        </Link>
      </div>
      <Card>
        <DataTable data={platformData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Platforms
