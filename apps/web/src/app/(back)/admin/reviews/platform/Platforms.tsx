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
import type { Database } from '@repo/supabase/types'

// Delete a platform
export const deletePlatform = async (platformId: number) => {
  const supabase = createClient()

  try {
    const { error } = await supabase.from('review_platforms').delete().eq('id', platformId)

    if (error) {
      console.error('Error deleting platform: ', error.message)
      toast('error', 'Error deleting platform: ' + error.message)
    } else {
      toast('success', 'Platform deleted successfully')
    }
  } catch (error) {
    console.error('Error deleting platform: ', error)

    return false
  }
}

const Platforms = ({ platformData }: { platformData: Database['public']['Tables']['review_platforms']['Row'][] }) => {
  // Hooks
  const router = useRouter()

  const columns: ColumnDef<Database['public']['Tables']['review_platforms']['Row']>[] = [
    {
      accessorKey: 'logo',
      header: 'Logo',
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
      header: 'Platform Name',
      cell: ({ row }) => <div className='capitalize'>{row.getValue('platform_name')}</div>
    },
    {
      accessorKey: 'slug',
      header: 'Slug',
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
            Edit
          </Link>
          <DeleteDialog
            variant='ghostDestructive'
            handleDelete={async () => {
              await deletePlatform(row.original.id)
              router.refresh()
            }}
            itemName='platform'
          />
        </div>
      )
    }
  ]

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex gap-y-2 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-3xl font-bold'>Review Platforms</h1>
        <Link href='/admin/reviews/platform/create'>
          <Button className='max-sm:is-full'>New review platform</Button>
        </Link>
      </div>
      <Card>
        <DataTable data={platformData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Platforms
