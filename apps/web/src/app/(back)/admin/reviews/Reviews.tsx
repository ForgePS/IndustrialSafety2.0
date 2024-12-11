'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit } from 'react-icons/tb'
import type { Row, ColumnDef } from '@tanstack/react-table'
import { Card } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import { Switch } from '@repo/ui/components/ui/switch'
import { Ratings } from '@repo/ui/components/ui/ratings'
import DataTable from '@repo/ui/components/ui/data-table'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import type { Database } from '@repo/supabase/types'

// Delete a review
export const deleteReview = async (reviewId: number) => {
  // Vars
  const supabase = createClient()

  try {
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId)

    if (error) {
      console.error('Error deleting review: ', error.message)
      toast('error', 'Error deleting category: ' + error.message)
    } else {
      toast('success', 'Review deleted successfully')
    }
  } catch (error) {
    console.error('Error deleting review: ', error)

    return false
  }
}

// Switch component for toggling isFeatured
const SwitchState = ({ row }: { row: Row<Database['public']['Tables']['reviews']['Row']> }) => {
  // States
  const [isFeatured, setIsFeatured] = useState(row.original.isFeatured)

  // Vars
  const supabase = createClient()

  const handleToggle = async (checked: boolean) => {
    // Optimistically update the state
    setIsFeatured(checked)

    // Perform the API update
    const { error } = await supabase.from('reviews').update({ isFeatured: checked }).eq('id', row.original.id)

    if (error) {
      console.error('Error updating review: ', error.message)

      // Revert back the state
      setIsFeatured(!checked)
    }
  }

  return <Switch checked={isFeatured} onCheckedChange={handleToggle} />
}

const Reviews = ({ reviewData }: { reviewData: Database['public']['Tables']['reviews']['Row'][] }) => {
  // Hooks
  const router = useRouter()

  const columns: ColumnDef<Database['public']['Tables']['reviews']['Row']>[] = [
    {
      accessorKey: 'username',
      header: 'User name',
      cell: ({ row }) => <div className='capitalize'>{row.getValue('username')}</div>
    },
    {
      accessorKey: 'rating',
      header: 'Ratings',
      cell: ({ row }) => <Ratings rating={row.original.rating || 5} disabled />
    },
    {
      accessorKey: 'platform',
      header: 'Review platform',
      cell: ({ row }) => <div className='capitalize'>{row.getValue('platform')}</div>
    },
    {
      accessorKey: 'isFeatured',
      header: 'Is Featured',
      cell: ({ row }) => <SwitchState row={row} />
    },
    {
      id: 'actions',
      header: 'Actions',
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex items-center gap-4'>
          <Link href={`/admin/reviews/${row.original.id}/edit`} className='text-primary flex items-center gap-1'>
            <TbEdit />
            Edit
          </Link>
          <DeleteDialog
            variant='ghostDestructive'
            handleDelete={async () => {
              await deleteReview(row.original.id)
              router.refresh()
            }}
          />
        </div>
      )
    }
  ]

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex gap-y-2 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-3xl font-bold'>Reviews</h1>
        <Link href='/admin/reviews/create'>
          <Button className='max-sm:is-full'>New review</Button>
        </Link>
      </div>
      <Card>
        <DataTable data={reviewData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Reviews
