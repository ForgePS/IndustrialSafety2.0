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
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Database } from '@repo/supabase/types'

export type ReviewsWithPlatforms = Database['public']['Tables']['reviews']['Row'] & {
  review_platforms?: {
    platform_name: string
  }
}

// Delete a review
export const deleteReview = async (reviewId: number, t: TFunction) => {
  // Vars
  const supabase = createClient()

  try {
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId)

    if (error) {
      console.error('Error deleting review: ', error.message)
      toast('error', t('admin:reviewsDeleteError', { message: error.message }))
    } else {
      toast('success', t('admin:reviewsDeleteSuccess'))
    }
  } catch (error) {
    console.error('Error deleting review: ', error)

    return false
  }
}

// Switch component for toggling isFeatured
const SwitchState = ({ row }: { row: Row<Database['public']['Tables']['reviews']['Row']> }) => {
  // States
  const [isFeatured, setIsFeatured] = useState(row.original.is_featured)

  // Vars
  const supabase = createClient()

  const handleToggle = async (checked: boolean) => {
    // Optimistically update the state
    setIsFeatured(checked)

    // Perform the API update
    const { error } = await supabase.from('reviews').update({ is_featured: checked }).eq('id', row.original.id)

    if (error) {
      console.error('Error updating review: ', error.message)

      // Revert back the state
      setIsFeatured(!checked)
    }
  }

  return <Switch checked={isFeatured} onCheckedChange={handleToggle} />
}

const Reviews = ({ reviewData }: { reviewData: ReviewsWithPlatforms[] }) => {
  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  const columns: ColumnDef<ReviewsWithPlatforms>[] = [
    {
      accessorKey: 'username',
      header: () => <Trans i18nKey='admin:reviewsUsernameColumn' />,
      cell: ({ row }) => <div className='capitalize'>{row.getValue('username')}</div>
    },
    {
      accessorKey: 'rating',
      header: () => <Trans i18nKey='admin:ratingsLabel' />,
      cell: ({ row }) => <Ratings rating={row.original.rating || 5} disabled />
    },
    {
      accessorKey: 'platform',
      header: () => <Trans i18nKey='admin:reviewsPlatformColumn' />,
      cell: ({ row }) => <div className='capitalize'>{row.original.review_platforms?.platform_name || '-'}</div>
    },
    {
      accessorKey: 'is_featured',
      header: () => <Trans i18nKey='admin:isFeaturedLabel' />,
      cell: ({ row }) => <SwitchState row={row} />
    },
    {
      id: 'actions',
      header: () => <Trans i18nKey='admin:actionsColumn' />,
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex items-center gap-4'>
          <Link href={`/admin/reviews/review/${row.original.id}/edit`} className='text-primary flex items-center gap-1'>
            <TbEdit />
            <Trans i18nKey='admin:editButton' />
          </Link>
          <DeleteDialog
            variant='ghostDestructive'
            handleDelete={async () => {
              await deleteReview(row.original.id, t)
              router.refresh()
            }}
            itemName='review'
          />
        </div>
      )
    }
  ]

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex gap-y-2 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-3xl font-bold'>
          <Trans i18nKey='admin:reviewsTitle' />
        </h1>
        <Link href='/admin/reviews/review/create'>
          <Button className='max-sm:is-full'>
            <Trans i18nKey='admin:reviewsNewButton' />
          </Button>
        </Link>
      </div>
      <Card>
        <DataTable data={reviewData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Reviews
